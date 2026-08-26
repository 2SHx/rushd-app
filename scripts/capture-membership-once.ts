// One-shot manual invocation of the daily forward membership capture. The cron calls the same
// function; this exists so the capture can be run and verified by hand without the scheduler.
import { captureUniverseMembership } from '../src/quant/universe/captureMembership';

captureUniverseMembership()
  .then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch((error) => {
    console.error('capture failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
