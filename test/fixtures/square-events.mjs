// Synthetic provider observations; no credentials or live customer data.
export const squareEventFixtures = [
  ...['PENDING','APPROVED','COMPLETED','FAILED','CANCELED',undefined,'FUTURE_STATUS'].flatMap(status => [
    ['payment.created','payment',status,'commerce.payment.created'],
    ['payment.updated','payment',status,status==='COMPLETED'?'commerce.checkout.completed':'commerce.payment.updated']
  ]),
  ['order.created','order_created',undefined,'commerce.order.created'],
  ['order.updated','order_updated',undefined,'commerce.order.updated'],
  ...['PENDING','COMPLETED','FAILED','REJECTED'].flatMap(status => [
    ['refund.created','refund',status,'commerce.refund.created'],
    ['refund.updated','refund',status,'commerce.refund.updated']
  ]),
  ['subscription.created','subscription','ACTIVE','commerce.subscription.created'],
  ['subscription.updated','subscription','CANCELED','commerce.subscription.updated'],
  ['invoice.payment_made','invoice','PAID','commerce.payment.succeeded'],
  ['invoice.payment_made','invoice','PARTIALLY_PAID','commerce.payment.succeeded'],
  ['invoice.scheduled_charge_failed','invoice','UNPAID','commerce.payment.failed'],
  ['dispute.created','dispute','EVIDENCE_REQUIRED','commerce.dispute.created'],
  ['dispute.state_changed','dispute','LOST','commerce.dispute.updated'],
  ...['future.event','payment.updated.COMPLETED','__proto__','constructor','toString'].map(type=>[type,'payment','COMPLETED','commerce.unknown'])
].map(([type,kind,status,expected],index)=>({
  expected,
  input:{type,event_id:`square_fixture_${index}`,created_at:'2026-09-19T12:00:00Z',data:{id:`object_${index}`,object:{[kind]:{id:`object_${index}`,...(status?{status}:{})}}}}
}));
