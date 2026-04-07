import { runLighthouse } from './modules/performance';
import { readFileSync } from 'fs';

(async function(){
  const url = process.argv[2] || 'https://www.bbcbenelux.com';
  console.log('Running lighthouse for', url);
  const res = await runLighthouse(url, {} as any);
  console.log('Perf result:', res);
})();
