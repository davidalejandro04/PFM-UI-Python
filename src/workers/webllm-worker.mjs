import { WebWorkerMLCEngineHandler } from "../../node_modules/@mlc-ai/web-llm/lib/index.js";

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event) => {
  handler.onmessage(event);
};
