import { setWorkerUrl } from "maplibre-gl";
// MapLibre builds its worker URL at runtime, which Vite's dev pre-bundling and production
// chunking both break. Importing the (self-contained) worker file as a URL and registering it
// explicitly works in dev and build.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);
