const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const loginSource = fs.readFileSync(path.join(root, 'app', 'login.tsx'), 'utf8');
const localDataSource = fs.readFileSync(path.join(root, 'lib', 'localDataExport.ts'), 'utf8');
const vehicleStoreSource = fs.readFileSync(path.join(root, 'lib', 'vehicleStore.ts'), 'utf8');
const loadoutStoreSource = fs.readFileSync(path.join(root, 'lib', 'loadoutStore.ts'), 'utf8');
const routeStoreSource = fs.readFileSync(path.join(root, 'lib', 'routeStore.ts'), 'utf8');

assert.ok(
  loginSource.includes("import { exportLocalData, importLocalData } from '../lib/localDataExport';") &&
    loginSource.includes('const [importingLocalData, setImportingLocalData] = useState(false);') &&
    loginSource.includes('const result = await importLocalData();') &&
    loginSource.includes('onImport={handleImport}') &&
    loginSource.includes('Import local data') &&
    loginSource.includes('Export local data') &&
    loginSource.includes('dataTransferRow') &&
    loginSource.includes("flexDirection: 'row'"),
  'Login should show equal adjacent import/export local data controls wired to the import engine.',
);

assert.ok(
  localDataSource.includes('export async function importLocalData()') &&
    localDataSource.includes("await import('expo-document-picker' as any)") &&
    localDataSource.includes('fsReadFileFromPickerUri') &&
    localDataSource.includes('vehicleStore.importLocalSnapshot') &&
    localDataSource.includes('loadoutStore.importLocalSnapshot') &&
    localDataSource.includes('loadoutItemStore.importLocalSnapshot') &&
    localDataSource.includes('routeStore.bulkUpsert') &&
    localDataSource.includes('setupStore.markComplete') &&
    localDataSource.includes('vehicleSetupStore.setActiveVehicleId'),
  'Local data import should pick JSON files, merge exported records, and restore active vehicle/setup state.',
);

assert.ok(
  vehicleStoreSource.includes('importLocalSnapshot: async (incomingVehicles: Vehicle[])') &&
    loadoutStoreSource.includes('importLocalSnapshot: async (incomingLoadouts: LocalLoadout[])') &&
    loadoutStoreSource.includes('importLocalSnapshot: async (incomingItems: LocalLoadoutItem[])') &&
    routeStoreSource.includes('bulkUpsert: (incomingRoutes: ImportedRoute[])'),
  'Local stores should expose merge-based restore hooks for ECS backup imports.',
);

console.log('local data import/export checks passed.');
