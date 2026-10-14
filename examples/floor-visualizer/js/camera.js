// Aparat urządzenia (getUserMedia). Na telefonach preferowany jest natywny aparat
// przez <input capture>, ten moduł obsługuje komputery i tablety z kamerą.

export async function captureFromCamera(dialog) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ta przeglądarka nie udostępnia aparatu.');
  const video = dialog.querySelector('video');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
  video.srcObject = stream;
  dialog.showModal();
  try {
    return await new Promise((resolve) => {
      dialog.querySelector('[data-cam="shoot"]').onclick = () => {
        const c = Object.assign(document.createElement('canvas'), { width: video.videoWidth, height: video.videoHeight });
        c.getContext('2d').drawImage(video, 0, 0);
        c.toBlob((b) => resolve(new File([b], 'aparat.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92);
      };
      dialog.querySelector('[data-cam="cancel"]').onclick = () => resolve(null);
      dialog.oncancel = () => resolve(null);
    });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    dialog.close();
  }
}
