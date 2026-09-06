import * as THREE from "three";

export type Surface = "wood" | "roof" | "rock" | "ground";
export type GrayhavenArt = {
  surfaces: Record<Surface, THREE.CanvasTexture>;
  trees: THREE.CanvasTexture[];
  textures: THREE.Texture[];
  estimatedTextureBytes: number;
  dispose: () => void;
};

// Static authored assets. Quadrants are sampled once into small GPU textures,
// so filtering/mipmaps never bleed between neighbouring atlas cells.
const surfaceUrl = new URL("./assets/coastal-materials-v1.png", import.meta.url).href;
const treeUrl = new URL("./assets/redwood-studies-v1.png", import.meta.url).href;

function readImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Grayhaven art asset failed to load: " + url));
    image.src = url;
  });
}

export async function loadGrayhavenArt(): Promise<GrayhavenArt> {
  const images = await Promise.all([readImage(surfaceUrl), readImage(treeUrl)]);
  const textures: THREE.CanvasTexture[] = [];
  try {
    const quadrants = (image: HTMLImageElement, repeat: boolean) => [0, 1, 2, 3].map(index => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D is unavailable");
      const w = image.naturalWidth / 2, h = image.naturalHeight / 2;
      context.drawImage(image, index % 2 * w, Math.floor(index / 2) * h, w, h, 0, 0, 512, 512);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.anisotropy = 4;
      textures.push(texture);
      return texture;
    });
    const surfaces = quadrants(images[0], true);
    const trees = quadrants(images[1], false);
    return {
      surfaces: { wood: surfaces[0], roof: surfaces[1], rock: surfaces[2], ground: surfaces[3] },
      trees, textures,
      // RGBA8 + full mip chain; excludes geometry, render targets and driver overhead.
      estimatedTextureBytes: textures.length * 512 * 512 * 4 * 4 / 3,
      dispose: () => textures.forEach(texture => texture.dispose()),
    };
  } catch (error) {
    textures.forEach(texture => texture.dispose());
    throw error;
  }
}
