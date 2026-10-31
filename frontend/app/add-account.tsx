import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";

export default function AddAccount() {
 const styles=useStyles(),{colors}=useTheme(),router=useRouter(),insets=useSafeAreaInsets(),invalidate=useInvalidateAll();
 const [provider,setProvider]=useState(""),[email,setEmail]=useState(""),[notes,setNotes]=useState(""),[signup,setSignup]=useState("");
 const save=useMutation({mutationFn:()=>api.createAccount({
  provider:provider.trim(),email:email.trim().toLowerCase(),notes:notes.trim(),
  status:"Needs confirmation",created_at:signup.trim()||undefined,source:"manual"
 }),onSuccess:(record:any)=>{invalidate();router.replace({pathname:"/account/[id]",params:{id:String(record.id)}});}});
 return <View style={styles.page}><AppHeader title="Add account" subtitle="Keep track of registrations, even when you do not have a paid plan" back/>
  <FormScroll>
   <TextField label="Provider or service" value={provider} onChangeText={setProvider} placeholder="Claude, GitHub, Docker..." testID="account-provider"/>
   <TextField label="Sign-in email (optional)" value={email} onChangeText={setEmail} placeholder="Leave blank if unconfirmed" keyboardType="email-address" testID="account-email"/>
   <TextField label="Registration date (optional)" value={signup} onChangeText={setSignup} placeholder="YYYY-MM-DD" testID="account-date"/>
   <TextField label="Notes and benefits (optional)" value={notes} onChangeText={setNotes} placeholder="Why I signed up, free credits, terms..." multiline testID="account-notes"/>
   <Text style={styles.help}>Unknown values remain blank. No passwords or payment credentials are stored here.</Text>
  </FormScroll>
  <KeyboardStickyView><View style={[styles.footer,{paddingBottom:insets.bottom+12}]}>
   <PrimaryButton title="Save account" icon="content-save-outline" onPress={()=>save.mutate()} loading={save.isPending} disabled={!provider.trim()} testID="save-account"/>
   {save.isError?<Text style={styles.error}>{(save.error as Error)?.message||"Could not save account"}</Text>:null}
  </View></KeyboardStickyView>
 </View>;
}
const useStyles=makeStyles(c=>({page:{flex:1,backgroundColor:c.surface},footer:{paddingHorizontal:18,paddingTop:12,backgroundColor:c.surface,borderTopWidth:1,borderTopColor:c.border},help:{color:c.muted,fontSize:12,lineHeight:18,marginTop:8},error:{color:c.error,fontSize:12,marginTop:8}}));
