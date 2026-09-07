import * as THREE from "three";
import type { ArchitectureSurface } from "./architectureMaterials";
import { forestAtlasCells, sequoiaAtlasCells } from "./forestLayout";

export type Surface = "wood" | "roof" | "rock" | "ground" | ArchitectureSurface;
export type GrayhavenArt = {
  surfaces: Record<Surface, THREE.CanvasTexture>;
  trees: THREE.CanvasTexture[];
  sequoias: THREE.CanvasTexture[];
  textures: THREE.Texture[];
  estimatedTextureBytes: number;
  dispose: () => void;
};

// Static authored assets. Quadrants are sampled once into small GPU textures,
// so filtering/mipmaps never bleed between neighbouring atlas cells.
const surfaceUrl = new URL("./assets/coastal-materials-v1.png", import.meta.url).href;
const treeUrl = new URL("./assets/redwood-tapered-v1.png", import.meta.url).href;
const architectureUrl = new URL("./assets/main-street-materials-v1.png", import.meta.url).href;
const sequoiaUrl = new URL("./assets/sequoia-giants-v1.png", import.meta.url).href;

function readImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Grayhaven art asset failed to load: " + url));
    image.src = url;
  });
}

export async function loadGrayhavenArt(): Promise<GrayhavenArt> {
  const images = await Promise.all([readImage(surfaceUrl), readImage(treeUrl), readImage(architectureUrl), readImage(sequoiaUrl)]);
  const textures: THREE.CanvasTexture[] = [];
  try {
    const cells = (image: HTMLImageElement, repeat: boolean, columns = 2, maxSize = 512,
      indices: readonly number[] = Array.from({ length: columns * 2 }, (_, i) => i)) => indices.map(index => {
      const w = image.naturalWidth / columns, h = image.naturalHeight / 2;
      const size = Math.min(maxSize, Math.floor(Math.min(w, h)));
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D is unavailable");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, index % columns * w, Math.floor(index / columns) * h, w, h, 0, 0, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = 4;
      if (!repeat) {
        // Anchor the painted trunk, rather than the transparent cell border, to
        // the terrain. A replacement atlas may have different bottom padding.
        const pixels = context.getImageData(0, 0, size, size).data;
        let base = size;
        outer: for (let y = size - 1; y >= 0; y--) {
          for (let x = Math.floor(size * .3); x < Math.ceil(size * .7); x++) {
            if (pixels[(y * size + x) * 4 + 3] >= 128) { base = y + 1; break outer; }
          }
        }
        texture.userData.baseV = 1 - base / size;
      }
      textures.push(texture);
      return texture;
    });
    const surfaces = cells(images[0], true);
    // Keep the tree silhouettes sharp at the allowed overview zoom. Architecture
    // tiles remain 512; trees retain native resolution up to 1024 per cell.
    const trees = cells(images[1], false, 2, 1024, forestAtlasCells);
    const architecture = cells(images[2], true, 3);
    const sequoias = cells(images[3], false, 2, 1024, sequoiaAtlasCells);
    return {
      surfaces: { wood: surfaces[0], roof: surfaces[1], rock: surfaces[2], ground: surfaces[3],
        clapboard: architecture[0], boardBatten: architecture[1], shingles: architecture[2],
        metalRoof: architecture[3], tarRoof: architecture[4], bareWood: architecture[5] },
      trees, sequoias, textures,
      // RGBA8 + full mip chain; excludes geometry, render targets and driver overhead.
      estimatedTextureBytes: textures.reduce((sum, texture) => sum + texture.image.width * texture.image.height * 4 * 4 / 3, 0),
      dispose: () => textures.forEach(texture => texture.dispose()),
    };
  } catch (error) {
    textures.forEach(texture => texture.dispose());
    throw error;
  }
}
