/**
 * High-precision offline Gmail extraction.
 * Generic receipts, newsletters, promotional footers and incidental keywords
 * are never sufficient to create a SubMind review candidate.
 */
export type MailType = "subscription" | "account" | "promo";
export type MailMessage = {id:string; subject:string; from:string; snippet:string; body?:string; date:string; labels?:string[]};
export type MailCandidate = {
  message_id:string; type:MailType; source_subject:string; source_from:string;
  source_date:string; confidence:number; evidence:string[]; classifier_version:number;
  extraction:Record<string,any>;
};
export const CLASSIFIER_VERSION=2;
export const MIN_CONFIDENCE=0.82;
export const MAIL_TYPES:MailType[]=["subscription","account","promo"];

const SEARCH:Record<MailType,string>={
 subscription:'{subject:"subscription" subject:"renewal" subject:"trial" subject:"billing" subject:"invoice" subject:"receipt" subject:"membership" subject:"payment received"}',
 account:'{subject:"welcome to" subject:"account created" subject:"verify your email" subject:"confirm your email" subject:"activate your account" subject:"registration confirmed" subject:"your new account"}',
 promo:'{subject:"promo code" subject:"coupon" subject:"voucher" subject:"giveaway" subject:"free credits" subject:"discount" subject:"exclusive offer" subject:"limited-time offer" subject:"% off"}'
};
export function buildGmailQueries(days:number,kinds:MailType[]=MAIL_TYPES){
 const d=Math.min(730,Math.max(1,Math.trunc(days)||30));
 return kinds.filter((v,i)=>MAIL_TYPES.includes(v)&&kinds.indexOf(v)===i).map(kind=>({
  kind,q:SEARCH[kind]+" newer_than:"+d+"d -in:spam -in:trash -in:sent -in:drafts"
 }));
}
const PERSONAL=new Set(["gmail.com","googlemail.com","yahoo.com","hotmail.com","outlook.com","live.com","icloud.com","me.com","aol.com","proton.me","protonmail.com"]);
const PROVIDERS:Record<string,string>={
 "openai.com":"ChatGPT","chatgpt.com":"ChatGPT","anthropic.com":"Claude","claude.ai":"Claude",
 "github.com":"GitHub","gitlab.com":"GitLab","replit.com":"Replit","google.com":"Google",
 "microsoft.com":"Microsoft","higgsfield.ai":"Higgsfield","canva.com":"Canva",
 "notion.so":"Notion","lovable.dev":"Lovable","stripe.com":"Stripe",
 "paypal.com":"PayPal","spotify.com":"Spotify","netflix.com":"Netflix",
 "adobe.com":"Adobe","apple.com":"Apple","amazon.com":"Amazon","figma.com":"Figma"
};
export function senderInfo(from:string):{provider:string;domain:string;address:string}|null{
 const raw=String(from||"").slice(0,250);
 const address=(raw.match(/<([^\s<>]+@[a-z0-9.-]+\.[a-z]{2,})>/i)?.[1]||
  raw.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i)?.[0]||"").toLowerCase();
 const domain=address.split("@")[1]||"";
 if(!domain||PERSONAL.has(domain))return null;
 const cleaned=domain.replace(/^(?:mail|email|notifications|billing|news|noreply|support|account)\./,"");
 const recognized=Object.entries(PROVIDERS).find(([host])=>cleaned===host||cleaned.endsWith("."+host));
 let provider=recognized?.[1]||"";
 if(!provider){
  const segments=cleaned.split(".");
  const base=segments.length>2&&segments[segments.length-2].length<4?segments[segments.length-3]:segments[segments.length-2];
  if(!base||/^(?:mailchimp|sendgrid|mailgun|amazonses|constantcontact)$/i.test(base))return null;
  provider=base.replace(/(^|[-_.])([a-z])/g,(_x,prefix:string,c:string)=>(prefix?" ":"")+c.toUpperCase()).trim();
 }
 return {provider,domain,address};
}
const SUB_STRONG=/\b(?:subscription (?:confirmation|confirmed|renewal|renewed|activated|started|is active|will renew|expires|expiring|cancelled)|your subscription (?:is|has|will)|renewal (?:notice|reminder|confirmation|successful|upcoming)|upcoming renewal|automatic renewal|auto[- ]renewal|(?:monthly|yearly|annual) (?:subscription|membership|plan)|(?:your )?(?:free )?trial (?:has )?(?:started|activated|ends|expires|ending|will end)|(?:your )?(?:membership|plan) (?:is active|has renewed|was activated|activated|renewed|expired|cancelled)|next billing date)\b/i;
const RECEIPT=/\b(?:invoice|receipt|payment received|payment confirmed|your payment|payment successful|billing statement|charge successful|charged for your subscription|payment completed)\b/i;
const RECURRING=/\b(?:subscription (?:plan|renewal|payment|billing|activated|renewed)|renewal|recurring|auto[- ]?renew|(?:monthly|annual|yearly|weekly|daily) (?:plan|membership|subscription|billing|charge)|next billing date|next payment date|plan (?:name|renews))\b/i;
const ACCOUNT=/\b(?:welcome to|(?:your |new )?account (?:has been )?(?:created|activated|registered)|registration (?:completed|confirmed|successful)|(?:confirm|verify|activate) (?:your )?(?:account|email address|email|registration)|thanks for (?:joining|registering|signing up)|sign[- ]?up (?:confirmed|complete))\b/i;
const ACCOUNT_CONTEXT=/\b(?:account|registration|sign[- ]?up|sign in to your account|log in to your account|complete your registration|set your password)\b/i;
const ACCOUNT_NEGATIVE=/\b(?:newsletter|mailing list|sign[- ]?in (?:code|attempt|alert)|one[- ]?time (?:code|password)|verification code|password reset|security alert|new device|two[- ]?factor|2fa|unsubscribe)\b/i;
const TRANSACTION_NEGATIVE=/\b(?:shipped|out for delivery|hotel booking|flight|tracking number|one[- ]?time purchase|cash on delivery|return accepted|refund issued)\b/i;
const PROMO=/\b(?:promo(?:tional)? code|coupon code|voucher code|discount code|giveaway|free (?:api )?credits|exclusive (?:deal|offer)|limited[- ]time (?:deal|offer)|redeem your (?:offer|code|voucher))\b|\b[1-9]\d?%\s*(?:off|discount|cashback)\b/i;
const PROMO_NEGATIVE=/\b(?:receipt|invoice|payment confirmation|order shipped|newsletter signup|verification|sign[- ]?in|password reset)\b/i;
function topBody(body?:string):string{
 const raw=String(body||"").slice(0,5500);
 const pos=raw.search(/(?:\n|\r)\s*(?:unsubscribe|manage (?:your )?(?:email )?preferences|you (?:are )?receiv(?:e|ing) this email because|click here to unsubscribe|view this email in your browser|privacy policy)\b/i);
 return (pos>=0?raw.slice(0,pos):raw).slice(0,1800).trim();
}
function dateNear(source:string,marker:RegExp):string|null{
 const index=source.search(marker);if(index<0)return null;
 const str=source.slice(index,index+105);
 const date=str.match(/(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2})|(?:\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20\d{2})/i)?.[0];
 if(!date)return null;
 const parsed=Date.parse(date);return Number.isFinite(parsed)?new Date(parsed).toISOString().slice(0,10):null;
}
function moneyNear(s:string):{price:number|null;currency:string|null}{
 // A standalone number from a shopping email must never become a recurring fee.
 const m=s.match(/(?:total (?:paid|charged|due)|amount (?:paid|due|charged)|(?:monthly|annual|yearly|renewal|subscription|plan) (?:billing|charge|price|cost|fee)|you (?:paid|were charged)|billed)\s*(?::|is|of)?\s*(USD|AED|EUR|GBP|INR|US\$|A\$|\$|€|£|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
 if(!m)return {price:null,currency:null};
 const n=Number(m[2].replace(/,/g,""));if(!Number.isFinite(n)||n<0||n>1000000)return {price:null,currency:null};
 const token=m[1].toUpperCase(),symbols:Record<string,string>={"$":"USD","US$":"USD","A$":"AUD","€":"EUR","£":"GBP","₹":"INR"};
 return {price:n,currency:symbols[token]||token};
}
function billingCycle(s:string):string{
 if(/\b(?:monthly|per month|every month|\/month|\/mo)\b/i.test(s))return"monthly";
 if(/\b(?:annually|yearly|per year|annual billing|\/year|\/yr)\b/i.test(s))return"yearly";
 if(/\b(?:weekly|per week)\b/i.test(s))return"weekly";
 if(/\b(?:daily|per day)\b/i.test(s))return"daily";
 return"unknown";
}
function planFrom(s:string):string{
 const m=s.match(/\b(?:plan|membership|subscription)\s*(?:name|tier)?\s*(?:\:|is)?\s*(Plus|Pro|Premium|Business|Team|Enterprise|Basic|Standard)\b/i);
 return m?m[1][0].toUpperCase()+m[1].slice(1).toLowerCase():"";
}
function couponFrom(subject:string,body:string):string{
 const short=subject+"\n"+body.slice(0,650);
 const m=short.match(/\b(?:(?:promo(?:tional)?|coupon|voucher|discount|redeem)\s+code|(?:use|enter|apply)\s+(?:the\s+)?code)\s*[:#=-]?\s*([A-Z][A-Z0-9_-]{3,23}|[0-9][A-Z0-9_-]{4,23})\b/i);
 const token=m?.[1]||"";
 if(!token||/^(?:HERE|YOUR|CODE|BELOW|FOR|WITH|THIS|NOW|SAVE|FREE|CLICK|TODAY|CHECK|ENTER|OFF|WHEN|SHOP|AT)$/i.test(token))return"";
 if(/\b(?:otp|security|verification|one[- ]?time|login)\s+code\b/i.test(short.slice(0,400)))return"";
 return token.toUpperCase();
}
export function classifyMail(message:MailMessage,mailbox:string):MailCandidate[]{
 if(!message?.id||!message.subject||!message.from)return[];
 if((message.labels||[]).some(s=>["SPAM","TRASH","SENT","DRAFT"].includes(s)))return[];
 const sender=senderInfo(message.from);if(!sender)return[];
 const subject=String(message.subject).replace(/^(?:(?:re|fwd?)\s*:\s*)+/gi,"").slice(0,230).trim();
 const body=topBody(message.body);
 const top=(String(message.snippet||"").slice(0,300)+"\n"+body).slice(0,1600);
 const relevant=subject+"\n"+top.slice(0,920);
 const common={message_id:message.id,source_subject:subject,source_from:message.from.slice(0,200),
  source_date:message.date,classifier_version:CLASSIFIER_VERSION};
 const email=String(mailbox||"").trim().toLowerCase();
 const strong=SUB_STRONG.test(subject)&&!TRANSACTION_NEGATIVE.test(subject)&&!/\b(?:offer|deal|discount|sale|newsletter|tips)\b/i.test(subject);
 const invoice=RECEIPT.test(subject)&&!TRANSACTION_NEGATIVE.test(subject)&&RECURRING.test(top.slice(0,1050));
 const account=ACCOUNT.test(subject)&&!ACCOUNT_NEGATIVE.test(subject)&&
  (!/^welcome to\b/i.test(subject)||ACCOUNT_CONTEXT.test(top.slice(0,650)));
 const promo=PROMO.test(subject)&&!PROMO_NEGATIVE.test(subject);
 if(strong||invoice){
  const renewal=dateNear(relevant,/\b(?:next (?:billing|payment|charge|renewal) (?:date)?|subscription renews?|renewal date)\b/i);
  const trialEnd=dateNear(relevant,/\b(?:trial (?:ends?|expires?|ending)|free trial ends?)\b/i);
  const amount=moneyNear(relevant);
  const paymentConfirmed=invoice && amount.price!==null && !!amount.currency &&
    /(?:payment (?:received|confirmed|successful|completed)|receipt|charged for your subscription|invoice paid)/i.test(subject);
  const eventType=/(?:subscription|plan|membership)\s+(?:has been |was |is now )?(?:cancelled|canceled)/i.test(subject)?"cancelled":
    /(?:subscription|plan|membership)\s+(?:has |has been |is now )?(?:expired|ended)/i.test(subject)?"expired":
    /(?:free )?trial\s+(?:has )?(?:started|activated|begun)/i.test(subject)?"trial_started":
    /(?:free )?trial\s+(?:ends?|expires?|ending|will end)/i.test(subject)?"trial_ending":
    /(?:subscription|plan|membership)\s+(?:has been |was |is now )?(?:activated|started|is active)|subscription confirmation|plan activated/i.test(subject)?"activated":
    /(?:subscription|membership|plan)\s+(?:has )?(?:renewed|was renewed)|renewal\s+(?:confirmed|successful|completed)/i.test(subject)?"renewed":
    paymentConfirmed?"payment":/(?:upcoming renewal|renewal reminder|renewal notice|next billing date|will renew)/i.test(subject)?"renewal_notice":"unknown";
  return [{...common,type:"subscription",confidence:paymentConfirmed?0.96:strong?0.93:0.86,
   evidence:[strong?"Subscription, trial or renewal event stated in subject":"Receipt plus recurring-billing terms near email start"],
   extraction:{provider:sender.provider,product:sender.provider,plan:planFrom(relevant),price:amount.price,currency:amount.currency,
    billing_cycle:billingCycle(relevant),renewal_date:renewal,trial_end:trialEnd,
    expiry_date:dateNear(relevant,/\b(?:subscription expires?|plan expires?|access ends?|membership expires?|valid until)\b/i),
    event_type:eventType,payment_confirmed:paymentConfirmed,account_email:email,
    status:"Unknown",auto_renew:null,review_required:true,source:"gmail",subject}}];
 }
 if(account){
  return [{...common,type:"account",confidence:/\baccount (?:created|activated|registered)\b/i.test(subject)?0.94:0.85,
   evidence:["Registration or account activation stated in email subject"],
   extraction:{provider:sender.provider,email,account_email:email,status:"Needs confirmation",subject}}];
 }
 if(promo){
  const code=couponFrom(subject,top);
  const discount=/\b[1-9]\d?%\s*(?:off|discount|cashback)\b/i.test(subject);
  const giveaway=/\b(?:giveaway|free (?:api )?credits|voucher)\b/i.test(subject);
  const expiry=dateNear(relevant,/\b(?:expires?|offer ends?|valid until|expiry|expiration|redeem by)\b/i);
  if(!code&&!discount&&!giveaway&&!expiry)return[];
  return [{...common,type:"promo",confidence:code?0.94:discount?0.89:0.84,
   evidence:[code?"Explicit code":discount?"Specific discount in subject":giveaway?"Giveaway or credits in subject":"Offer with expiry"],
   extraction:{provider:sender.provider,code,discount_text:subject,expiry_date:expiry,
    account_email:email,source:"gmail",verified:false,source_url:null,subject}}];
 }
 return[];
}
