import type { Core } from 'cytoscape';

const MAX_SIDE = 8192;
const MAX_PIXELS = 32000000;
const PADDING = 40;

interface ExportSize {
  width: number;
  height: number;
  graphWidth: number;
  graphHeight: number;
  padding: number;
}

async function addPadding(window: Window & typeof globalThis, document: Document, blob: Blob, image: ExportSize) {
  const sourceUrl = window.URL.createObjectURL(blob);
  try {
    const source = new window.Image();
    await new Promise<void>((resolve, reject) => {
      source.onload = () => resolve();
      source.onerror = reject;
      source.src = sourceUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(source, image.padding, image.padding);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encoding failed'))), 'image/png');
    });
  } finally {
    window.URL.revokeObjectURL(sourceUrl);
  }
}

export function setupImageExport(window: Window & typeof globalThis, document: Document, graph: Core) {
  const resolution = document.getElementById('export-resolution') as HTMLSelectElement;
  const dimensions = document.getElementById('export-dimensions')!;
  const button = document.getElementById('export-png') as HTMLButtonElement;
  const status = document.getElementById('export-status')!;
  let busy = false;
  let active = true;

  function size() {
    if (!graph.nodes().not('.filtered-out').length) return null;
    const bounds = graph.elements().boundingBox();
    const scale = Number(resolution.value);
    const padding = PADDING * scale;
    const graphWidth = Math.ceil(bounds.w) * scale;
    const graphHeight = Math.ceil(bounds.h) * scale;
    return {
      width: graphWidth + 2 * padding,
      height: graphHeight + 2 * padding,
      graphWidth,
      graphHeight,
      padding,
    };
  }

  function update() {
    const image = size();
    const tooLarge =
      image && (image.width > MAX_SIDE || image.height > MAX_SIDE || image.width * image.height > MAX_PIXELS);
    dimensions.textContent = image
      ? `${image.width.toLocaleString()} × ${image.height.toLocaleString()} px`
      : 'No visible entities.';
    status.textContent = tooLarge ? 'Image is too large. Choose a lower resolution or narrow the graph.' : '';
    button.disabled = busy || !image || !!tooLarge;
  }

  resolution.addEventListener('change', update);
  graph.on('position', 'node', update);
  button.addEventListener('click', async () => {
    const image = size();
    if (!image || button.disabled) return;
    busy = true;
    update();
    let failed = false;
    try {
      const graphBlob = await graph.png({
        full: true,
        bg: '#ffffff',
        maxWidth: image.graphWidth,
        maxHeight: image.graphHeight,
        output: 'blob-promise',
      });
      if (!active) return;
      const blob = await addPadding(window, document, graphBlob, image);
      if (!active) return;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dependency-graph.png';
      link.click();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch {
      failed = true;
    } finally {
      busy = false;
      if (active) {
        update();
        if (failed) status.textContent = 'Could not export the image. Try a lower resolution or a smaller graph.';
      }
    }
  });
  update();
  return {
    update,
    cleanup() {
      active = false;
      graph.off('position', 'node', update);
    },
  };
}
