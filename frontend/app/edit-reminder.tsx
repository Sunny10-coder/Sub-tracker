import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";
const valid=(t:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export default function EditReminder(){
 const styles=useStyles(),{colors}=useTheme(),router=useRouter(),insets=useSafeAreaInsets(),invalidate=useInvalidateAll();
 const {id}=useLocalSearchParams<{id:string}>();
 const q=useQuery({queryKey:["edit-reminder",id],queryFn:async()=>{
   const items=await api.reminders();const found=items.find((x:any)=>x.id===id);
   if(!found)throw Error("Reminder no longer exists");return found;
 },enabled:!!id});
 const [title,setTitle]=useState(""),[date,setDate]=useState(""),[time,setTime]=useState("09:00");
 useEffect(()=>{if(q.data){setTitle(q.data.title||"");setDate(String(q.data.due_date||"").slice(0,10));setTime(q.data.remind_time||"09:00");}},[q.data]);
 const save=useMutation({mutationFn:()=>{
   const when=new Date(date+"T"+time+":00");
   if(!title.trim()||!valid(time)||Number.isNaN(when.getTime())||when.getTime()<=Date.now())throw Error("Set a valid future date and time.");
   return api.updateReminder(String(id),{title:title.trim(),due_date:date,remind_time:time});
 },onSuccess:()=>{invalidate();router.back();}});
 return <View style={styles.page}><AppHeader title="Edit reminder" back/>
 <FormScroll><TextField label="Reminder" value={title} onChangeText={setTitle}/>
 <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate}/>
 <TextField label="Time (24h HH:MM)" value={time} onChangeText={setTime} placeholder="18:30"/>
 <Text style={styles.info}>Time follows your phone's local time zone.</Text>
 {q.isError?<Text style={styles.error}>{(q.error as Error).message}</Text>:null}
 {save.isError?<Text style={styles.error}>{(save.error as Error).message}</Text>:null}
 </FormScroll><KeyboardStickyView><View style={[styles.bar,{paddingBottom:insets.bottom+12}]}>
 <PrimaryButton title="Save reminder" icon="content-save" disabled={!title.trim()||!valid(time)||q.isLoading} loading={save.isPending} onPress={()=>save.mutate()}/>
 </View></KeyboardStickyView></View>;
}
const useStyles=makeStyles(c=>({page:{flex:1,backgroundColor:c.surface},bar:{padding:16,borderTopColor:c.border,borderTopWidth:1},
info:{color:c.muted,fontSize:12},error:{color:c.error,fontSize:12}}));
