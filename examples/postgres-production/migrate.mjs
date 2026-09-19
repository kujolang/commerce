import {stores,close} from './shared.mjs';

try{await stores.migrate();console.log('Commerce PostgreSQL migration complete');}finally{await close();}
