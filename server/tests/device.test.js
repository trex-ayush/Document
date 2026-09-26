import { describe, it, expect } from 'vitest';
import { describeBrowser, describeDevice } from '../src/utils/device.js';

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
