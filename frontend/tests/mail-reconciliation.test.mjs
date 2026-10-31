import assert from "node:assert/strict";
import { applyMailCandidate } from "../src/lib/mail-reconciliation.ts";
import { classifyMail } from "../src/lib/gmail-classifier.ts";
const empty=()=>({accounts:[],subscriptions:[],promo_codes:[],promo_findings:[],review_queue:[],mail_activity:[]});
let n=0;const uid=()=>String(++n);
const mailbox="owner@example.com",now="2026-10-31T15:00:00Z";
const candidate=(id,type,subject,extraction,confidence=0.95)=>({
 message_id:id,type,source_subject:subject,source_from:"Provider <billing@example-service.com>",
 source_date:now,confidence,evidence:["Explicit transactional evidence"],classifier_version:2,extraction
});
const v=empty();
const verified=candidate("mail1","subscription","Your subscription renewed",
 {provider:"ChatGPT",plan:"Pro",price:20,currency:"USD",billing_cycle:"monthly",
  renewal_date:"2026-11-30",event_type:"renewed"});
assert.equal(applyMailCandidate(v,verified,mailbox,now,uid).decision,"added");
assert.equal(v.subscriptions.length,1);
assert.equal(v.subscriptions[0].status,"Active");
assert.equal(applyMailCandidate(v,verified,mailbox,now,uid).decision,"duplicate");
assert.equal(v.subscriptions.length,1);
assert.equal(applyMailCandidate(v,candidate("mail2","subscription","Renewal confirmed",
 {provider:"OpenAI",plan:"Pro",price:20,currency:"USD",event_type:"renewed",
  renewal_date:"2026-12-30"}),mailbox,now,uid).decision,"updated");
assert.equal(v.subscriptions.length,1);
assert.equal(v.subscriptions[0].renewal_date,"2026-12-30");
assert.equal(applyMailCandidate(v,candidate("mail2b","subscription","Your trial ends on 2026-11-02",
 {provider:"ChatGPT",plan:"Pro",event_type:"trial_ending",trial_end:"2026-11-02"}),mailbox,now,uid).decision,"updated");
assert.equal(v.subscriptions.length,1);
assert.equal(v.subscriptions[0].trial_end,"2026-11-02");
assert.equal(applyMailCandidate(v,candidate("mail3","subscription","Payment successful",
 {provider:"ChatGPT",plan:"Pro",price:30,currency:"USD",event_type:"payment",
  payment_confirmed:true}),mailbox,now,uid).decision,"review");
assert.equal(v.subscriptions[0].price,20);
assert.equal(v.review_queue.length,1);
assert.equal(applyMailCandidate(v,candidate("mail4","subscription","Upcoming renewal",
 {provider:"ChatGPT",plan:"Unknown",event_type:"renewal_notice",renewal_date:"2027-01-31"}),mailbox,now,uid).decision,"review");
assert.equal(applyMailCandidate(v,candidate("mail5","account","Verify your email",
 {provider:"Replit",account_email:mailbox,event_type:"verification_pending"}),mailbox,now,uid).decision,"review");
assert.equal(applyMailCandidate(v,candidate("mail6","account","Account created",
 {provider:"Replit",account_email:mailbox,event_type:"account_created"}),mailbox,now,uid).decision,"added");
assert.equal(v.accounts.filter(x=>x.provider==="Replit").length,1);
assert.equal(applyMailCandidate(v,candidate("mail7","promo","Discount code SAVE20",
 {provider:"Replit",code:"SAVE20",expiry_date:"2026-11-30"}),mailbox,now,uid).decision,"added");
assert.equal(applyMailCandidate(v,candidate("mail8","promo","Discount code SAVE20",
 {provider:"Replit",code:"SAVE20",expiry_date:"2026-12-31"}),mailbox,now,uid).decision,"updated");
assert.equal(v.promo_codes.length,1);
assert.equal(v.promo_codes[0].expiry_date,"2026-12-31");
const real=classifyMail({id:"real1",subject:"Payment successful",from:"Billing <billing@replit.com>",
 snippet:"Your monthly billing: USD 19.00",body:"Monthly billing: USD 19.00",date:now},mailbox);
assert.equal(real.length,1);
assert.equal(real[0].extraction.price,19);
assert.equal(real[0].extraction.payment_confirmed,true);
const activated=classifyMail({id:"real2",subject:"Plan activated",from:"Replit <billing@replit.com>",
 snippet:"Your Pro plan is now active",body:"Your Pro plan is now active",date:now},mailbox);
assert.equal(activated.length,1);
assert.equal(activated[0].extraction.event_type,"activated");
console.log("Mail reconciliation and classifier activation/payment regression checks passed.");
