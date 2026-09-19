/*
   Copyright (C) 2026 Afri Blanck (@l5yth)

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

/**
 * @file `npm run check:pages`: serve the repository under `/dancing-with-marcel/`
 * and fetch every URL the page loads.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPagesCheck } from './lib/pages.mjs';

process.exitCode = await runPagesCheck({
  root: resolve(fileURLToPath(new URL('..', import.meta.url))),
});
