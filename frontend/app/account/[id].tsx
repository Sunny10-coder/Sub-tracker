import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Alert, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, Icon, Loading, PrimaryButton, SectionLabel } from "@/src/components/ui";
import { TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";

export default function AccountDetail() {
 const styles=useStyles(),{colors}=useTheme(),router=useRouter(),insets=useSafeAreaInsets();
 const {id}=useLocalSearchParams<{id:string}>(),invalidate=useInvalidateAll();
 const {data,isLoading,refetch}=useQuery({queryKey:["account",id],queryFn:()=>api.account(String(id)),enabled:!!id});
 const [draft,setDraft]=useState<Record<string,string>>({});
 const val=(key:string)=>draft[key]??String(data?.[key]??"");
 const edit=(key:string)=>(text:string)=>setDraft(d=>({...d,[key]:text}));
 const patch=useMutation({mutationFn:()=>api.updateAccount(String(id),{
  provider:val("provider").trim(),email:val("email").trim().toLowerCase(),status:val("status").trim(),
  notes:val("notes").trim(),website:val("website").trim()
 }),onSuccess:()=>{setDraft({});invalidate();refetch();}});
 const del=useMutation({mutationFn:()=>api.deleteAccount(String(id)),onSuccess:()=>{invalidate();router.back();}});
 if(isLoading)return <View style={styles.page}><AppHeader title="Account" back/><Loading/></View>;
 if(!data)return <View style={styles.page}><AppHeader title="Account unavailable" back/><Text style={styles.note}>This record was not found.</Text></View>;
 const confirmDelete=()=>Alert.alert("Delete this account?","Linked subscriptions will not be deleted.",[
  {text:"Keep account",style:"cancel"},{text:"Delete",style:"destructive",onPress:()=>del.mutate()}]);
 return <View style={styles.page}>
  <AppHeader title={data.provider||"Account"} subtitle={data.email||"Sign-in email unknown"} back/>
  <ScrollView contentContainerStyle={{padding:17,paddingBottom:insets.bottom+36,gap:14}}>
   <Card style={styles.card}>
    <View style={styles.row}><Icon name="account-circle-outline" color={colors.brandPrimary} size={33}/>
     <View style={{flex:1}}><Text style={styles.heading}>{data.provider}</Text><Text style={styles.note}>Status: {data.status||"Unknown"}</Text></View></View>
    {data.email?<PrimaryButton title="Copy sign-in email" icon="content-copy" variant="secondary" onPress={()=>Clipboard.setStringAsync(data.email)}/>:null}
   </Card>
   <SectionLabel>account details</SectionLabel>
   <TextField label="Provider" value={val("provider")} onChangeText={edit("provider")} testID="detail-account-provider"/>
   <TextField label="Sign-in email" value={val("email")} onChangeText={edit("email")} placeholder="Unknown" keyboardType="email-address" testID="detail-account-email"/>
   <TextField label="Status" value={val("status")} onChangeText={edit("status")} placeholder="Needs confirmation" testID="detail-account-status"/>
   <TextField label="Website" value={val("website")} onChangeText={edit("website")} placeholder="https://provider.example" keyboardType="url" testID="detail-account-website"/>
   <TextField label="Notes, benefits and credits" value={val("notes")} onChangeText={edit("notes")} placeholder="Plan and trial details..." multiline testID="detail-account-notes"/>
   {Object.keys(draft).length>0?<PrimaryButton title="Save changes" icon="content-save" disabled={!val("provider").trim()} loading={patch.isPending} onPress={()=>patch.mutate()} testID="save-account-details"/>:null}
   {patch.isError?<Text style={styles.error}>{(patch.error as Error).message}</Text>:null}
   <SectionLabel>linked subscriptions</SectionLabel>
   {Array.isArray(data.plans)&&data.plans.length?data.plans.map((p:any)=><Card key={p.id} onPress={()=>router.push({pathname:"/subscription/[id]",params:{id:p.id}})}>
    <View style={styles.row}><View style={{flex:1}}><Text style={styles.heading}>{p.plan||"Unknown plan"}</Text><Text style={styles.note}>{p.status||"Unknown"}</Text></View><Icon name="chevron-right" color={colors.muted}/></View>
   </Card>):<Text style={styles.note}>No subscriptions linked to this account. An account registration is not proof of a paid subscription.</Text>}
   <PrimaryButton title="Delete account" icon="trash-can-outline" variant="secondary" loading={del.isPending} onPress={confirmDelete}/>
  </ScrollView>
 </View>;
}
const useStyles=makeStyles(c=>({page:{flex:1,backgroundColor:c.surface},card:{gap:10},row:{flexDirection:"row",alignItems:"center",gap:12},heading:{color:c.onSurface,fontSize:17,fontWeight:"700"},note:{color:c.muted,fontSize:13,lineHeight:20},error:{color:c.error,fontSize:12}}));
