import {processNext} from '@kujolang/commerce';

export const runOne=({queue,receiptStore,deadLetters,projectVerifiedEvent})=>processNext({queue,receipts:receiptStore,deadLetters,processor:projectVerifiedEvent,maxAttempts:5,baseDelayMs:1000});
