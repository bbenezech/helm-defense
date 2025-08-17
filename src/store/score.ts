import { localStore } from "./index.ts";

const score = localStore("score", 0);

export default score;
