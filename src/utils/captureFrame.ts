/** Grab a JPEG still from a running <video> element via an offscreen canvas. */
export async function captureFrameJpeg(
  video: HTMLVideoElement | null,
  quality = 0.85,
): Promise<Blob | null> {
  if (!video || !video.videoWidth || !video.videoHeight) return null

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality)
  })
}
