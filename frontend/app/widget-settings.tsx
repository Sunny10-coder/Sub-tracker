import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AppHeader, Icon, PrimaryButton } from "@/src/components/ui";
import { hasNativeHomeWidget, refreshHomeWidget, requestHomeWidgetPin } from "@/src/lib/widget-sync";
import { makeStyles, useTheme } from "@/src/theme";

export default function WidgetSettings() {
  const styles=useStyles();
  const {colors}=useTheme();
  const router=useRouter();
  const insets=useSafeAreaInsets();
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  const available=hasNativeHomeWidget();
  const pin=async()=>{
    setBusy(true);
    try{
      const requested=await requestHomeWidgetPin();
      setStatus(requested?
        "Widget request sent. Confirm it on your home screen.":
        "Use your phone's widget picker to add SubMind Overview manually.");
    }catch(e:any){setStatus(String(e?.message||"Could not request widget."));}
    finally{setBusy(false);}
  };
  const refresh=async()=>{
    setBusy(true);
    const updated=await refreshHomeWidget();
    setBusy(false);
    setStatus(updated?"Widget data updated.":"Widget is unavailable in this app installation.");
  };
  return(
    <View style={styles.container}>
      <AppHeader title="home widget" subtitle="Lumia Metro · Android" back />
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:insets.bottom+30,gap:13}}>
        <View style={styles.preview}>
          <Text style={styles.logo}>S U B M I N D</Text>
          <Pressable style={[styles.tile,{backgroundColor:"#6400DA"}]}
            onPress={()=>router.push("/(tabs)/subscriptions")}>
            <Icon name="calendar-clock-outline" size={21} color="#FFFFFF"/>
            <View><Text style={styles.tileTitle}>subscription expiring</Text>
              <Text style={styles.tileDescription}>Next 30 days · upcoming deadlines</Text></View>
          </Pressable>
          <Pressable style={[styles.tile,{backgroundColor:"#007DB4"}]}
            onPress={()=>router.push("/notes")}>
            <Icon name="note-text-outline" size={21} color="#FFFFFF"/>
            <View><Text style={styles.tileTitle}>notes</Text>
              <Text style={styles.tileDescription}>Your latest saved note</Text></View>
          </Pressable>
          <Pressable style={[styles.tile,{backgroundColor:"#078C15"}]}
            onPress={()=>router.push("/link-vault")}>
            <Icon name="link-variant" size={21} color="#FFFFFF"/>
            <View><Text style={styles.tileTitle}>reminder links</Text>
              <Text style={styles.tileDescription}>Links with active reminders</Text></View>
          </Pressable>
        </View>
        <Text style={styles.body}>
          Keep these three sections on your Android home screen.
          They refresh when SubMind opens or saved data changes.
        </Text>
        {available?(
          <PrimaryButton title="Add widget to home screen" icon="view-dashboard-outline"
            onPress={pin} loading={busy} disabled={busy} testID="pin-home-widget" />
        ):<Text style={styles.warning}>
          This installation does not contain the native widget module.
          Install the updated Android APK to enable the widget.
        </Text>}
        <PrimaryButton title="Refresh widget" icon="refresh" variant="secondary"
          onPress={()=>void refresh()} disabled={busy} testID="refresh-home-widget" />
        <Text style={styles.caption}>To add manually: long-press your Android home screen,
          choose Widgets, find SubMind and select Overview. Supported launchers may
          offer a direct add request above. If the widget contains no data yet, open
          SubMind and tap Refresh widget.</Text>
        <Text style={styles.caption}>The widget displays only short labels,
          not account emails or full notes. Its values may not change while the app
          is closed because the private SubMind database stays on the phone.</Text>
        {status?<Text style={styles.status}>{status}</Text>:null}
      </ScrollView>
    </View>
  );
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},
 preview:{backgroundColor:"#050505",padding:10,gap:5},
 logo:{color:"#FFFFFF",fontSize:17,fontWeight:"700" as const,letterSpacing:2,padding:5},
 tile:{minHeight:72,padding:12,gap:10,flexDirection:"row" as const,alignItems:"center" as const},
 tileTitle:{color:"#FFFFFF",fontSize:17,fontWeight:"700" as const},
 tileDescription:{color:"#EFF2F7",fontSize:12,marginTop:3},
 body:{color:c.onSurface,fontSize:15,lineHeight:23},
 warning:{color:c.warning,fontSize:14,lineHeight:21},
 caption:{color:c.muted,fontSize:13,lineHeight:20},
 status:{color:c.brandSecondary,fontSize:14,fontWeight:"700" as const}
}));
