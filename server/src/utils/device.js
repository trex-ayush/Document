import { UAParser } from 'ua-parser-js';

/**
 * A readable device name from a User-Agent string, for alert emails and access logs.
 *
 * Chrome on Android no longer sends the real phone model: its "reduced" User-Agent says
 * `Linux; Android 10; K` for every phone, so `device.model` is just "K". Placeholder models like
 * that are ignored, and the name falls back to the OS plus the kind of device instead —
 * "Android phone", "iPhone", "Windows computer", "Mac".
 */
const PLACEHOLDER_MODELS = new Set(['k', 'unspecified', 'unknown', 'linux', 'x86_64']);

const OS_NAMES = {
  'Mac OS': 'Mac',
  macOS: 'Mac',
  'Chrome OS': 'Chromebook',
  Chromium: 'Chromebook',
};

function realModel(device) {
  const model = String(device?.model || '').trim();
  if (model.length < 2 || PLACEHOLDER_MODELS.has(model.toLowerCase())) return '';
  // iPhone / iPad / Macintosh already say what they are.
  if (/^(iphone|ipad|ipod|macintosh)$/i.test(model)) return '';
  const vendor = String(device?.vendor || '').trim();
  return vendor && !model.toLowerCase().startsWith(vendor.toLowerCase()) ? `${vendor} ${model}` : model;
}

export function describeDevice(userAgent) {
  const { device, os } = new UAParser(userAgent || '').getResult();
  const model = realModel(device);
  if (model) return model;

  const osName = OS_NAMES[os?.name] || os?.name || '';
  const kind = device?.type === 'mobile' ? 'phone' : device?.type === 'tablet' ? 'tablet' : '';

  if (/^iOS$/i.test(osName)) return device?.model === 'iPad' || kind === 'tablet' ? 'iPad' : 'iPhone';
  if (osName === 'Mac' || osName === 'Chromebook') return osName;
  if (osName && kind) return `${osName} ${kind}`;
  if (osName) return `${osName} computer`;
  return kind ? `Unknown ${kind}` : 'Unknown device';
}

export function describeBrowser(userAgent, { withVersion = false } = {}) {
  const { browser } = new UAParser(userAgent || '').getResult();
  const name = browser?.name || 'Unknown browser';
  const major = withVersion ? String(browser?.version || '').split('.')[0] : '';
  return major ? `${name} ${major}` : name;
}

/**
 * The operating system with its version where the version is real. Chrome's reduced User-Agent
 * always claims "Android 10", and Windows 10 and 11 both report "Windows NT 10.0", so those two
 * versions are not trusted.
 */
export function describeOs(userAgent) {
  const { os } = new UAParser(userAgent || '').getResult();
  const name = OS_NAMES[os?.name] || os?.name || '';
  if (!name) return 'Unknown system';
  const version = String(os?.version || '');
  if (name === 'Windows' && version === '10') return 'Windows 10 or 11';
  if (name === 'Android' && / K\)/.test(userAgent || '')) return 'Android';
  if (name === 'Mac' || name === 'Chromebook') return name === 'Mac' ? 'macOS' : 'ChromeOS';
  return version ? `${name} ${version}` : name;
}
