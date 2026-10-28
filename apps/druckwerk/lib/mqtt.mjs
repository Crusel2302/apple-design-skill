// Minimaler MQTT-3.1.1-Client über TLS (QoS 0), gerade genug für die Bambu Cloud:
// verbinden, abonnieren, veröffentlichen, Keep-alive und automatisches Wiederverbinden.
import tls from 'node:tls';
import { EventEmitter } from 'node:events';

const CONNECT = 1, CONNACK = 2, PUBLISH = 3, SUBSCRIBE = 8, SUBACK = 9, PINGREQ = 12, PINGRESP = 13, DISCONNECT = 14;

function str(s) {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length);
  return Buffer.concat([len, b]);
}

function remainingLength(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return Buffer.from(out);
}

function packet(type, flags, body) {
  return Buffer.concat([Buffer.from([(type << 4) | flags]), remainingLength(body.length), body]);
}

export class MqttClient extends EventEmitter {
  constructor({ host, port = 8883, username, password, clientId, keepalive = 60 }) {
    super();
    Object.assign(this, { host, port, username, password, keepalive });
    this.clientId = clientId || 'druckwerk_' + Math.random().toString(16).slice(2, 10);
    this.subscriptions = new Set();
    this.packetId = 1;
    this.buffer = Buffer.alloc(0);
    this.connected = false;
    this.closed = false;
    this.backoff = 2000;
  }

  connect() {
    this.closed = false;
    this.socket = tls.connect({ host: this.host, port: this.port, servername: this.host });
    this.socket.on('secureConnect', () => this.#sendConnect());
    this.socket.on('data', (chunk) => this.#onData(chunk));
    this.socket.on('error', (err) => this.emit('error', err));
    this.socket.on('close', () => this.#onClose());
    return this;
  }

  subscribe(topic) {
    this.subscriptions.add(topic);
    if (this.connected) this.#sendSubscribe(topic);
  }

  unsubscribeAll() {
    this.subscriptions.clear();
  }

  publish(topic, payload) {
    if (!this.connected) return false;
    const body = Buffer.concat([str(topic), Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload))]);
    this.socket.write(packet(PUBLISH, 0, body));
    return true;
  }

  end() {
    this.closed = true;
    clearInterval(this.pingTimer);
    clearTimeout(this.retryTimer);
    if (this.socket && !this.socket.destroyed) {
      try { this.socket.write(packet(DISCONNECT, 0, Buffer.alloc(0))); } catch {}
      this.socket.end();
    }
  }

  #sendConnect() {
    let flags = 0x02; // clean session
    const payload = [str(this.clientId)];
    if (this.username) { flags |= 0x80; payload.push(str(this.username)); }
    if (this.password) { flags |= 0x40; payload.push(str(this.password)); }
    const ka = Buffer.alloc(2);
    ka.writeUInt16BE(this.keepalive);
    const body = Buffer.concat([str('MQTT'), Buffer.from([4, flags]), ka, ...payload]);
    this.socket.write(packet(CONNECT, 0, body));
  }

  #sendSubscribe(topic) {
    const id = Buffer.alloc(2);
    id.writeUInt16BE(this.packetId++ & 0xffff || 1);
    this.socket.write(packet(SUBSCRIBE, 2, Buffer.concat([id, str(topic), Buffer.from([0])])));
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      if (this.buffer.length < 2) return;
      let mult = 1, len = 0, i = 1, byte;
      do {
        if (i >= this.buffer.length) return;
        byte = this.buffer[i++];
        len += (byte & 0x7f) * mult;
        mult *= 128;
      } while (byte & 0x80);
      if (this.buffer.length < i + len) return;
      const header = this.buffer[0];
      const body = this.buffer.subarray(i, i + len);
      this.buffer = this.buffer.subarray(i + len);
      this.#handle(header >> 4, header & 0x0f, body);
    }
  }

  #handle(type, flags, body) {
    if (type === CONNACK) {
      const rc = body[1];
      if (rc !== 0) {
        const reasons = { 4: 'Benutzername oder Passwort abgelehnt', 5: 'Nicht autorisiert' };
        this.emit('error', new Error(`MQTT-Verbindung abgelehnt: ${reasons[rc] || 'Code ' + rc}`));
        this.closed = rc === 4 || rc === 5; // mit ungültigem Token nicht endlos neu versuchen
        this.socket.end();
        return;
      }
      this.connected = true;
      this.backoff = 2000;
      for (const t of this.subscriptions) this.#sendSubscribe(t);
      this.pingTimer = setInterval(() => this.socket.write(packet(PINGREQ, 0, Buffer.alloc(0))), (this.keepalive * 1000) / 2);
      this.emit('connect');
    } else if (type === PUBLISH) {
      const qos = (flags >> 1) & 3;
      const tlen = body.readUInt16BE(0);
      const topic = body.subarray(2, 2 + tlen).toString('utf8');
      const payload = body.subarray(2 + tlen + (qos > 0 ? 2 : 0));
      this.emit('message', topic, payload);
    } else if (type === SUBACK || type === PINGRESP) {
      // nichts zu tun
    }
  }

  #onClose() {
    const was = this.connected;
    this.connected = false;
    clearInterval(this.pingTimer);
    if (was) this.emit('offline');
    if (!this.closed) {
      this.retryTimer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 60000);
    }
  }
}
