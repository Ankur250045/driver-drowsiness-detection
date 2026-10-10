// watch.js — making the driver's smartwatch vibrate.
//
// Method 1 (works with almost every smartwatch): phone notification.
//   The server publishes an urgent notification to the driver's ntfy topic. The ntfy
//   app on the phone shows it and the watch vibrates because it mirrors phone
//   notifications. See backend/app/services/watch.py.
//
// Method 2 (direct Bluetooth, Chrome on Android / Windows / Mac):
//   Many fitness bands and BLE trackers implement the standard Bluetooth
//   "Immediate Alert" service (0x1802, used for "find my device"). Writing alert
//   level 2 ("high") to its characteristic (0x2A06) makes the device vibrate or beep.
//   Watches that don't offer this service (most Wear OS / Apple watches) can only
//   use method 1 — the page tells the user if their device doesn't support it.

import { api } from './api.js';

const IMMEDIATE_ALERT_SERVICE = 0x1802;
const ALERT_LEVEL_CHARACTERISTIC = 0x2a06;
const LEVEL = { off: 0, mild: 1, high: 2 };

class BluetoothWatch {
  constructor() {
    this.device = null;
    this.characteristic = null;
    this.onChange = () => {};
  }

  get supported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  get connected() {
    return !!(this.device && this.device.gatt.connected && this.characteristic);
  }

  get name() {
    return this.device ? this.device.name || 'Unnamed device' : null;
  }

  // Must be called from a button click (browser rule for Bluetooth).
  async connect() {
    if (!this.supported) throw new Error('This browser has no Web Bluetooth. Use Chrome on Android, Windows or Mac.');
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [IMMEDIATE_ALERT_SERVICE],
    });
    this.device.addEventListener('gattserverdisconnected', () => {
      this.characteristic = null;
      this.onChange();
    });
    const server = await this.device.gatt.connect();
    let service;
    try {
      service = await server.getPrimaryService(IMMEDIATE_ALERT_SERVICE);
    } catch {
      server.disconnect();
      throw new Error(
        `"${this.name}" does not support the Bluetooth Immediate Alert service, so it can't be made to vibrate directly. ` +
          'Use the phone-notification method instead.',
      );
    }
    this.characteristic = await service.getCharacteristic(ALERT_LEVEL_CHARACTERISTIC);
    this.onChange();
    return this.name;
  }

  async vibrate(level = 'high') {
    if (!this.connected) return false;
    try {
      await this.characteristic.writeValueWithoutResponse(Uint8Array.of(LEVEL[level]));
      return true;
    } catch {
      try {
        await this.characteristic.writeValue(Uint8Array.of(LEVEL[level]));
        return true;
      } catch {
        return false;
      }
    }
  }

  async stop() {
    await this.vibrate('off');
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) this.device.gatt.disconnect();
    this.characteristic = null;
    this.onChange();
  }
}

export const bluetoothWatch = new BluetoothWatch();

// Random private topic name, e.g. "drowsy-k3j9x2q7pa".
export function newTopic() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = 'drowsy-';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

// Called when the alarm starts: try every watch method that is set up.
export async function alertWatch(user, reason) {
  const result = { bluetooth: false, notification: 'not_configured' };
  result.bluetooth = await bluetoothWatch.vibrate('high');
  if (user && user.watch_topic) {
    try {
      result.notification = (await api.alertWatch(reason)).status;
    } catch {
      result.notification = 'failed';
    }
  }
  return result;
}
