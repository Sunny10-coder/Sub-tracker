import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { METRO, MetroBrand } from "@/src/components/metro-tiles";
import { Icon } from "@/src/components/ui";
import { api, useInvalidateAll, useReviewQueue } from "@/src/lib/api";

const TABS = ["All", "subscription", "account", "promo"];
export default function MailReview() {
  const router = useRouter();const insets=useSafeAreaInsets();
  const {data:queue=[],isFetching,refetch}=useReviewQueue();
  const invalidate=useInvalidateAll();
  const [tab,setTab]=useState("All");
  const [range,setRange]=useState<"today"|"week"|"all">("week");
  const [edits,setEdits]=useState<Record<string,Record<string,string>>>({});
  const [working,setWorking]=useState("");
  const now=Date.now();
  const rows=queue.filter((e:any)=>{
    if(tab!=="All"&&e.type!==tab)return false;
    if(range==="all")return true;
    const stamp=Date.parse(e.source_date||e.created_at||"");
    if(!Number.isFinite(stamp))return false;
    return range==="today"?now-stamp<=86400000:now-stamp<=7*86400000;
  }).sort((a:any,b:any)=>String(b.source_date||b.created_at).localeCompare(String(a.source_date||a.created_at)));
  const set=(id:string,field:string,value:string)=>setEdits(prev=>({...prev,[id]:{...prev[id],[field]:value}}));
  const take=async (item:any,action:"approve"|"dismiss")=>{
    setWorking(item.id);
    try {
      const change={...(edits[item.id]||{})};
      if(change.price!==undefined)change.price=String(change.price).trim();
      await api.inboxAction(item.id,{action,edits:change});
      invalidate();refetch();
    }catch(e:any){Alert.alert("Could not review",e.message||String(e))}
    finally{setWorking("")}
  };
  const field=(item:any,name:string,label:string,keyboardType:"default"|"decimal-pad"="default")=>
    <View style={{flex:1,minWidth:"40%",gap:4}}>
      <Text style={{color:METRO.dim,fontSize:11,fontWeight:"700"}}>{label}</Text>
      <TextInput value={edits[item.id]?.[name]??String(item.extraction?.[name]??"")} onChangeText={s=>set(item.id,name,s)}
        keyboardType={keyboardType} placeholder={label} placeholderTextColor="#707078"
        style={{backgroundColor:"#282832",paddingVertical:11,paddingHorizontal:12,borderRadius:7,color:METRO.white,fontSize:14}}/>
    </View>;
  return <View style={{flex:1,backgroundColor:METRO.black}}>
    <ScrollView contentContainerStyle={{paddingTop:insets.top+10,paddingHorizontal:15,paddingBottom:insets.bottom+60,gap:13}}>
      <Pressable onPress={()=>router.back()} style={{flexDirection:"row",alignItems:"center",gap:10}}>
        <Icon name="arrow-left" color={METRO.white} size={25}/><MetroBrand word="REVIEW"/>
      </Pressable>
      <Text style={{color:METRO.dim,fontSize:13,lineHeight:20}}>Clear evidence is saved automatically. Only doubtful billing, conflicting prices, uncertain account creation and promotions without a reliable code appear here. Review whenever you are free.</Text>
      <View style={{flexDirection:"row",gap:8}}>
        {([{id:"today",name:"TODAY"},{id:"week",name:"LAST 7 DAYS"},{id:"all",name:"ALL HISTORY"}] as const).map(x=>
        <Pressable key={x.id} onPress={()=>setRange(x.id)} style={{flex:1,
          backgroundColor:range===x.id?METRO.purple:"#2A2C3C",borderRadius:8,padding:12,alignItems:"center"}}>
          <Text style={{color:METRO.white,fontWeight:"900",fontSize:11}}>{x.name}</Text>
        </Pressable>)}
      </View>
      <View style={{flexDirection:"row",gap:5}}>
        {TABS.map(s=><Pressable key={s} onPress={()=>setTab(s)} style={{flex:1,backgroundColor:tab===s?METRO.cyan:"#24242D",padding:11,borderRadius:7,alignItems:"center"}}>
          <Text numberOfLines={1} style={{color:tab===s?METRO.ink:METRO.white,fontSize:11,fontWeight:"800"}}>{s==="All"?"ALL":s==="subscription"?"PLANS":s==="account"?"ACCOUNTS":"PROMOS"}</Text>
        </Pressable>)}
      </View>
      <Text style={{fontWeight:"900",fontSize:17,color:METRO.white}}>{rows.length} PENDING ITEMS</Text>
      {!rows.length?<View style={{padding:26,borderWidth:1,borderColor:"#353543",borderRadius:12,alignItems:"center",gap:12}}>
        <Icon name="check-decagram-outline" size={37} color={METRO.green}/>
        <Text style={{color:METRO.dim}}>Nothing needs review. Scan Gmail or save a link to add more data.</Text>
      </View>:rows.map((item:any,index:number)=>{
        const c=item.extraction||{};const accent=item.type==="promo"?METRO.purple:item.type==="account"?METRO.cyan:METRO.orange;
        const date=String(item.source_date||item.created_at||"").slice(0,10);
        const previous=String(rows[index-1]?.source_date||rows[index-1]?.created_at||"").slice(0,10);
        return <View key={item.id} style={{gap:9}}>
         {index===0||date!==previous?<View style={{backgroundColor:"#20263A",padding:11,borderRadius:9}}>
           <Text style={{color:METRO.cyan,fontSize:12,fontWeight:"900"}}>{date||"DATE UNKNOWN"}</Text>
         </View>:null}
         <View style={{backgroundColor:"#181820",borderRadius:14,borderWidth:1,borderColor:"#343440",overflow:"hidden"}}>
          <View style={{height:5,backgroundColor:accent}}/>
          <View style={{padding:16,gap:11}}>
            <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
              <Text style={{color:accent,fontSize:12,fontWeight:"900"}}>{item.type.toUpperCase()} · {Math.round((item.confidence||0)*100)}% PARSER CONFIDENCE</Text>
              <Icon name="email-outline" color={METRO.dim}/>
            </View>
            <Text style={{color:METRO.white,fontWeight:"800",fontSize:18}}>{c.provider||"Unknown service"}</Text>
            <Text style={{color:METRO.dim,fontSize:12,lineHeight:18}} numberOfLines={2}>{item.source_subject}</Text>
            <Text style={{color:METRO.dim,fontSize:11}}>{item.mailbox_email} · {item.source_date?.slice(0,10)}</Text>
            <View style={{flexDirection:"row",flexWrap:"wrap",gap:10}}>
              {field(item,"provider","Service")}
              {item.type==="promo"?<>{field(item,"code","Promo code")}{field(item,"expiry_date","Expiry YYYY-MM-DD")}</>:
              item.type==="account"?field(item,"account_email","Account email"):
              <>{field(item,"plan","Plan name")}{field(item,"price","Price","decimal-pad")}{field(item,"currency","Currency")}{field(item,"billing_cycle","Billing cycle")}{field(item,"renewal_date","Renewal YYYY-MM-DD")}{field(item,"trial_end","Trial end YYYY-MM-DD")}</>}
            </View>
            {item.type==="subscription"?<Text style={{color:METRO.orange,fontSize:11,lineHeight:17}}>The plan will be recorded as Trial or Unknown with review required; it will not count as confirmed paid spending until verified in its details.</Text>:
              item.type==="promo"?<Text style={{color:METRO.orange,fontSize:11}}>Offers without promo codes can also be saved. Eligibility, availability and expiry still need confirmation at the source.</Text>:null}
            <View style={{flexDirection:"row",gap:9,marginTop:2}}>
              <Pressable disabled={!!working}
                onPress={()=>take(item,"approve")}
                style={{backgroundColor:working?"#3E4651":METRO.green,padding:13,flex:1,alignItems:"center",borderRadius:8,opacity:working?0.65:1}}>
                <Text style={{color:METRO.white,fontWeight:"900"}}>{working===item.id?"SAVING…":"APPROVE"}</Text>
              </Pressable>
              <Pressable disabled={!!working} onPress={()=>take(item,"dismiss")} style={{backgroundColor:"#363640",padding:13,flex:1,alignItems:"center",borderRadius:8}}>
                <Text style={{color:METRO.white,fontWeight:"800"}}>DISMISS</Text>
              </Pressable>
            </View>
          </View>
         </View>
        </View>;
      })}
    </ScrollView>
  </View>;
}
