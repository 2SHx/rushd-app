// Runs once per test process, before any test file. Installs the interlock that stops an
// unscoped bulk delete/update from reaching a database that is not marked disposable.
// See src/quant/testing/guardDestructiveWrites.ts for the incident this exists to prevent.
import { installDestructiveWriteGuard } from '@/quant/testing/guardDestructiveWrites';

installDestructiveWriteGuard();
