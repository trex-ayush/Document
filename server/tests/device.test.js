import { describe, it, expect } from 'vitest';
import { describeBrowser, describeDevice, describeOs } from '../src/utils/device.js';
import { newDeviceLoginEmail } from '../src/services/emailTemplates.js';

const UA = {
  chromeAndroidReduced:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  chromeAndroidTabletReduced:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  samsungFullModel:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

describe('describeDevice', () => {
  it('never shows Chrome\'s placeholder model "K" — says "Android phone" instead', () => {
    expect(describeDevice(UA.chromeAndroidReduced)).toBe('Android phone');
    expect(describeDevice(UA.chromeAndroidTabletReduced)).toBe('Android tablet');
  });

  it('keeps a real model when the browser sends one', () => {
    expect(describeDevice(UA.samsungFullModel)).toBe('Samsung SM-S911B');
  });

  it('names Apple devices and computers plainly', () => {
    expect(describeDevice(UA.iphone)).toBe('iPhone');
    expect(describeDevice(UA.ipad)).toBe('iPad');
    expect(describeDevice(UA.windowsChrome)).toBe('Windows computer');
    expect(describeDevice(UA.macSafari)).toBe('Mac');
  });

  it('copes with a missing user agent', () => {
    expect(describeDevice('')).toBe('Unknown device');
    expect(describeDevice(undefined)).toBe('Unknown device');
    expect(describeBrowser(undefined)).toBe('Unknown browser');
  });

  it('names the browser', () => {
    expect(describeBrowser(UA.chromeAndroidReduced)).toBe('Chrome');
    expect(describeBrowser(UA.samsungFullModel)).toBe('Samsung Internet');
  });
});

describe('describeOs and the new-device email', () => {
  it('names the system, without the versions browsers fake', () => {
    expect(describeOs(UA.windowsChrome)).toBe('Windows 10 or 11');
    expect(describeOs(UA.chromeAndroidReduced)).toBe('Android');
    expect(describeOs(UA.samsungFullModel)).toBe('Android 14');
    expect(describeOs(UA.macSafari)).toBe('macOS');
    expect(describeOs(UA.iphone)).toMatch(/^iOS 17/);
  });

  it('adds the browser version when asked', () => {
    expect(describeBrowser(UA.windowsChrome, { withVersion: true })).toBe('Chrome 129');
  });

  it('shows device, system, browser, IP and Indian time', () => {
    const email = newDeviceLoginEmail({
      memberName: 'Ayush Singh',
      device: 'Windows computer',
      os: 'Windows 10 or 11',
      browser: 'Chrome 129',
      ip: '49.36.12.87',
      time: '2026-09-26T13:42:39Z',
    });
    expect(email.text).toContain('IP address: 49.36.12.87');
    expect(email.text).toContain('System: Windows 10 or 11');
    expect(email.text).toMatch(/7:12\s?pm IST/i);
    expect(email.html).toContain('<li>Browser: Chrome 129</li>');
  });
});
