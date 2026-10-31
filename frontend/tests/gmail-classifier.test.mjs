import assert from "node:assert/strict";
import { classifyMail, buildGmailQueries } from "../src/lib/gmail-classifier.ts";
const msg=(subject,body,from="Billing <billing@replit.com>")=>({
 id:"fixture-1",subject,from,body,snippet:body.slice(0,180),date:"2026-10-31T12:00:00Z"
});
const type=(m)=>classifyMail(m,"test@example.com").map(x=>x.type);
assert.deepEqual(type(msg("Your subscription renewed","Your Pro plan renews on 2026-11-30. Monthly billing: USD 19.00.")),["subscription"]);
assert.deepEqual(type(msg("Your receipt for headphones","Total paid: AED 150.00. Shipped today.")),[]);
assert.deepEqual(type(msg("Welcome to Replit","Activate your account and complete your registration.")),["account"]);
assert.deepEqual(type(msg("Welcome to our newsletter","You are subscribed to weekly marketing emails.")),[]);
assert.deepEqual(type(msg("Your verification code","Code 448291, verify your email.")),[]);
assert.deepEqual(type(msg("Exclusive offer: 40% off","Redeem code SAVE40 before 2026-11-30.")),["promo"]);
assert.deepEqual(type(msg("Payment successful","Thanks for your order. Manage your subscription to marketing emails in footer.")),[]);
assert.deepEqual(type(msg("Free credits giveaway","Claim your 50 free API credits.")),["promo"]);
assert.deepEqual(type(msg("Reset your password","Use a one-time password.")),[]);
assert.deepEqual(type(msg("Exclusive offer","Browse the latest products.")),[]);
assert.deepEqual(type(msg("Account created","Complete your sign-in", "Someone <person@gmail.com>")),[]);
const q=buildGmailQueries(180);
assert.equal(q.length,3);
assert.ok(q.every(x=>x.q.includes("-in:spam")));
console.log("Gmail classifier synthetic regression fixtures passed.");
