import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Check, FolderOpen, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

const JPEG_QUALITY = 0.92;

/** Ask for the back camera when there is one (laptops simply give their only camera). */
async function openStream(deviceId) {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) throw new Error('NO_CAMERA_API');
  if (deviceId) return media.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
  try {
    return await media.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (err) {
    // A camera that can't meet the wishes above still works with no wishes at all.
    if (err?.name === 'OverconstrainedError' || err?.name === 'NotReadableError') {
      return media.getUserMedia({ video: true, audio: false });
    }
    throw err;
  }
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * The computer's camera, for PCs and laptops (desktop browsers ignore `<input capture>`): a live
 * preview, a big round Capture button, a camera switcher when there are several, then Retake /
 * Use photo. "Use photo" hands over a full-resolution JPEG File. When the camera can't be opened
 * (permission refused, no camera) it says so and offers "Choose files" instead.
 * Full screen on small screens, a large centred panel on PC. Every camera track stops on close.
 *
 * Props: onCapture(file), onChooseFiles(), onClose()
 */
export default function CameraCapture({ onCapture, onChooseFiles, onClose }) {
  const { t } = useTranslation(['documents', 'common']);
  const panelRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | live | shot | error
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState(null);
  const [shot, setShot] = useState(null); // { blob, url }

  useFocusTrap(panelRef, true, { onClose, closeOnEscape: true });

  const start = useCallback(async (deviceId) => {
    setStatus('starting');
    stopStream(streamRef.current);
    streamRef.current = null;
    try {
      const stream = await openStream(deviceId);
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setCameraId(stream.getVideoTracks()[0]?.getSettings?.().deviceId || deviceId || null);
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
      setStatus('live');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    // Opened after the first paint so the <video> is there to receive the stream.
    const timer = setTimeout(() => start(null), 0);
    return () => {
      clearTimeout(timer);
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [start]);

  useEffect(() => () => shot && URL.revokeObjectURL(shot.url), [shot]);

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShot({ blob, url: URL.createObjectURL(blob) });
        setStatus('shot');
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  };

  const retake = () => {
    setShot(null);
    setStatus('live');
  };

  const usePhoto = () => {
    if (!shot) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    onCapture(new File([shot.blob], `photo-${stamp}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
    onClose();
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const at = cameras.findIndex((c) => c.deviceId === cameraId);
    start(cameras[(at + 1) % cameras.length].deviceId);
  };

  const chooseFiles = () => {
    onClose();
    onChooseFiles();
  };

  const barBtn = 'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold';

  return createPortal(
    <div className="fixed inset-0 z-[80] lg:flex lg:items-center lg:justify-center lg:bg-black/60 lg:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('camera.title', 'Take a photo')}
        tabIndex={-1}
        className="flex h-full w-full flex-col bg-neutral-950 text-white outline-none lg:h-[88vh] lg:max-w-4xl lg:overflow-hidden lg:rounded-2xl lg:shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-[calc(var(--safe-top)+0.5rem)]">
          <Tooltip content={t('common:tip.close', 'Close this')}>
            <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10" aria-label={t('common:actions.close', 'Close')}>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </Tooltip>
          <p className="min-w-0 truncate text-sm font-semibold">{t('camera.title', 'Take a photo')}</p>
          {cameras.length > 1 && status === 'live' ? (
            <Tooltip content={t('tip.switchCamera', 'Use the other camera')}>
              <button type="button" onClick={switchCamera} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10" aria-label={t('camera.switch', 'Switch camera')}>
                <RefreshCw className="h-5 w-5" aria-hidden="true" />
              </button>
            </Tooltip>
          ) : (
            <span className="h-11 w-11" aria-hidden="true" />
          )}
        </div>

        <div className="relative min-h-0 flex-1 bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 h-full w-full object-contain ${status === 'live' ? '' : 'invisible'}`}
          />
          {status === 'shot' && shot && <img src={shot.url} alt={t('camera.preview', 'The photo you took')} className="absolute inset-0 h-full w-full object-contain" />}
          {status === 'starting' && (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">{t('camera.starting', 'Opening the camera…')}</p>
          )}
          {status === 'error' && (
            <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <Camera className="h-10 w-10 text-white/50" aria-hidden="true" />
              <p className="max-w-sm text-[15px] text-white/85">
                {t('camera.error', 'Couldn’t open the camera. Check permission in your browser, or choose a file instead.')}
              </p>
              <button type="button" onClick={chooseFiles} className={`${barBtn} bg-primary-500 text-white hover:bg-primary-600`}>
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                {t('camera.chooseFiles', 'Choose files')}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-center gap-3 px-4 pb-[calc(var(--safe-bottom)+1rem)] pt-4">
          {status === 'shot' ? (
            <>
              <Tooltip content={t('tip.retake', 'Take the photo again')}>
                <button type="button" onClick={retake} className={`${barBtn} text-white/90 ring-1 ring-white/30 hover:bg-white/10`}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t('camera.retake', 'Retake')}
                </button>
              </Tooltip>
              <Tooltip content={t('tip.usePhoto', 'Keep this photo')}>
                <button type="button" onClick={usePhoto} className={`${barBtn} bg-primary-500 text-white hover:bg-primary-600`}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t('camera.use', 'Use photo')}
                </button>
              </Tooltip>
            </>
          ) : status === 'error' ? (
            <span className="h-[72px]" aria-hidden="true" />
          ) : (
            <Tooltip content={t('tip.takePhoto', 'Take a photo with the camera')}>
              <button
                type="button"
                onClick={capture}
                disabled={status !== 'live'}
                aria-label={t('camera.capture', 'Take photo')}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/90 disabled:opacity-40"
              >
                <span className="h-14 w-14 rounded-full bg-white transition-transform active:scale-90" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
