import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, useInvalidateAll, useSubscription } from "@/src/lib/api";
import { AppHeader, Loading, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";

export default function RecordPayment(){
 const styles=useStyles(),router=useRouter(),insets=useSafeAreaInsets();
 const {id}=useLocalSearchParams<{id:string}>(),invalidate=useInvalidateAll();
 const {data:sub,isLoading}=useSubscription(String(id));
 const [amount,setAmount]=useState<string|null>(null),[currency,setCurrency]=useState<string|null>(null),
  [date,setDate]=useState(new Date().toISOString().slice(0,10));
 const actualAmount=amount??(sub?.price==null?"":String(sub.price));
 const actualCurrency=currency??(sub?.currency||"");
 const save=useMutation({mutationFn:()=>api.recordPayment(String(id),{
  amount:Number(actualAmount),currency:actualCurrency.trim().toUpperCase(),date,
  confirmed_by_user:true
 }),onSuccess:()=>{invalidate();router.back();}});
 if(isLoading)return <View style={styles.page}><AppHeader title="Record payment" back/><Loading/></View>;
 const valid=actualAmount.trim()!==""&&Number.isFinite(Number(actualAmount))&&Number(actualAmount)>=0&&
  !!actualCurrency.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(date);
 return <View style={styles.page}>
  <AppHeader title="Record payment" subtitle={sub?.provider||"Subscription"} back/>
  <FormScroll>
   <Text style={styles.note}>Only record a payment that was actually charged. A renewal notice or promotional email is not payment confirmation.</Text>
   <TextField label="Amount actually charged" value={actualAmount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" testID="payment-amount"/>
   <TextField label="Currency" value={actualCurrency} onChangeText={setCurrency} placeholder="AED, USD, EUR..." testID="payment-currency"/>
   <TextField label="Payment date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" testID="payment-date"/>
   <Text style={styles.note}>Duplicate payments with the same subscription, amount, currency and date are not added twice to the local vault.</Text>
  </FormScroll>
  <KeyboardStickyView><View style={[styles.footer,{paddingBottom:insets.bottom+12}]}>
   <PrimaryButton title="Confirm payment was made" icon="cash-check" onPress={()=>save.mutate()} loading={save.isPending} disabled={!valid} testID="payment-confirm"/>
   {save.isError?<Text style={styles.error}>{(save.error as Error).message}</Text>:null}
  </View></KeyboardStickyView>
 </View>;
}
const useStyles=makeStyles(c=>({page:{flex:1,backgroundColor:c.surface},note:{color:c.onSurfaceSecondary,fontSize:13,lineHeight:20,marginBottom:8},footer:{paddingHorizontal:18,paddingTop:12,borderTopWidth:1,borderTopColor:c.border},error:{color:c.error,fontSize:12,marginTop:7}}));
