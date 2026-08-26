// Export one day's membership capture to git-committed NDJSON. Defaults to today.
import { exportMembershipDay } from '../src/quant/universe/exportMembership';

const arg = process.argv[2];
const day = arg
  ? new Date(`${arg}T00:00:00.000Z`)
  : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

exportMembershipDay(day)
  .then(({ file, record, written }) => {
    console.log(JSON.stringify({ file, day: record.d, included: record.n, excluded: record.ex.length, written }));
    process.exit(0);
  })
  .catch((error) => {
    console.error('export failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
