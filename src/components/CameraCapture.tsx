import React, { useState, useRef, useEffect } from "react";
import { Camera, RotateCw, Upload, Image, Trash2, Check, AlertCircle, RefreshCw, X } from "lucide-react";

interface CameraCaptureProps {
  onPhotoAdded: (photoUrl: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ onPhotoAdded, onClose }: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load available video devices
  const loadDevices = async () => {
    try {
      const devicesList = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devicesList.filter(d => d.kind === "videoinput");
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.warn("Failed to list video input devices:", err);
    }
  };

  // Start video stream
  const startCamera = async (deviceId?: string) => {
    setError(null);
    setIsInitializing(true);
    setIsCameraActive(true);
    
    // Stop any existing stream first
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    const targetDevice = deviceId || selectedDeviceId;
    const constraints: MediaStreamConstraints = {
      video: targetDevice 
        ? { deviceId: { exact: targetDevice } } 
        : { facingMode: "environment" } // Default to rear camera on mobile
    };

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      // Update device list to get actual names once permissions are granted
      await loadDevices();
    } catch (err: any) {
      console.error("Camera access failed:", err);
      let errMsg = "Unable to access the camera.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errMsg = "Camera permission was denied. Please allow camera access in your browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errMsg = "No camera device was found on this system.";
      }
      setError(errMsg);
      setIsCameraActive(false);
    } finally {
      setIsInitializing(false);
    }
  };

  // Stop video stream
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  // Cycle through cameras if multiple exist
  const handleSwitchCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    setSelectedDeviceId(nextDevice.deviceId);
    startCamera(nextDevice.deviceId);
  };

  // Capture frame to canvas & convert to base64 data URL
  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // Set canvas to match the video's actual stream dimensions
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        canvas.width = width;
        canvas.height = height;

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, width, height);

        // Convert canvas image to base64 Data URL
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setCapturedImage(dataUrl);
          stopCamera();
        } catch (err) {
          console.error("Failed to capture image data URL:", err);
          setError("Failed to process the captured image.");
        }
      }
    }
  };

  // Handle standard file upload fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        alert("Image file size should be less than 8MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCapturedImage(event.target.result as string);
          stopCamera();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Reset/retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  // Confirm photo addition
  const handleSavePhoto = () => {
    if (capturedImage) {
      onPhotoAdded(capturedImage);
      onClose();
    }
  };

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-900 pb-3">
        <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
          <Camera className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h5 className="text-xs font-extrabold uppercase tracking-wider">
            {capturedImage ? "Preview Capture" : "Capture Day Photo"}
          </h5>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-350 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main View Area */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-inner">
        {/* Real-time Video Stream */}
        {isCameraActive && !capturedImage && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100" // Mirror effect for selfie camera
          />
        )}

        {/* Captured Image Preview */}
        {capturedImage && (
          <img
            src={capturedImage}
            alt="Captured log"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
          />
        )}

        {/* Initial/Static placeholder state */}
        {!isCameraActive && !capturedImage && (
          <div className="text-center p-6 space-y-3">
            <div className="mx-auto w-12 h-12 bg-slate-800/80 rounded-full flex items-center justify-center text-slate-400">
              <Camera className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-300">No active camera feed</p>
              <p className="text-[10px] text-slate-500">Access your webcam or upload a photo from your file manager.</p>
            </div>
          </div>
        )}

        {/* Initializing Loading spinner */}
        {isInitializing && (
          <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center text-white space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-300">Initializing Camera...</span>
          </div>
        )}

        {/* Floating Controls for active video stream */}
        {isCameraActive && !capturedImage && !isInitializing && (
          <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center z-10">
            {/* Switch Camera Rotate button (only if multiple exists) */}
            {devices.length > 1 ? (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="p-2 bg-slate-950/80 hover:bg-slate-950 text-white rounded-lg backdrop-blur-sm transition-all cursor-pointer border border-slate-800/40"
                title="Switch Camera Device"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="w-8" />
            )}

            {/* Shoot Shutter button */}
            <button
              type="button"
              onClick={handleCapture}
              className="w-11 h-11 bg-teal-500 hover:bg-teal-450 border-[3px] border-white text-white rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95"
              title="Capture Photo"
            >
              <div className="w-4 h-4 bg-white rounded-full" />
            </button>

            <button
              type="button"
              onClick={stopCamera}
              className="p-2 bg-rose-600/80 hover:bg-rose-650 text-white text-[10px] font-bold rounded-lg backdrop-blur-sm transition-all cursor-pointer border border-rose-800/20"
            >
              Stop Feed
            </button>
          </div>
        )}
      </div>

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Error Indicator */}
      {error && (
        <div className="flex gap-2 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-950 rounded-xl items-start">
          <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-rose-650 dark:text-rose-400 font-semibold leading-relaxed">
            {error}
          </p>
        </div>
      )}

      {/* Bottom Action bar */}
      <div className="flex flex-wrap gap-2 justify-center pt-1">
        {/* Case 1: Initial State - Choose between camera and file picker */}
        {!isCameraActive && !capturedImage && (
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={() => startCamera()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <Camera className="w-4 h-4" />
              Start Webcam
            </button>

            <label className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer text-center">
              <Upload className="w-4 h-4" />
              Upload Image
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Case 2: Camera running but not captured yet */}
        {isCameraActive && !capturedImage && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
            Aim your camera and click the circular button at the bottom of the viewfinder.
          </p>
        )}

        {/* Case 3: Image is captured/uploaded - Save or Retake */}
        {capturedImage && (
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retake / Clear
            </button>

            <button
              type="button"
              onClick={handleSavePhoto}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              Save Photo to Day
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
