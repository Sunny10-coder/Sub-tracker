import { Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/ui";

export const TAB_BAR_SPACE = 105;
const PRIMARY = [
  { name: "account-hub", label: "Accounts", icon: "account-multiple-outline", active: "account-multiple", color: "#13B5EA" },
  { name: "subscriptions", label: "Plans", icon: "credit-card-clock-outline", active: "credit-card-clock", color: "#F7A009" },
  { name: "prompts", label: "Prompts", icon: "text-box-multiple-outline", active: "text-box-multiple", color: "#D462EB" },
  { name: "vault", label: "Vault", icon: "folder-star-multiple-outline", active: "folder-star-multiple", color: "#2ACEA1" },
  { name: "brain", label: "Brain", icon: "graph-outline", active: "graph", color: "#7A81F8" },
] as const;

function PrimaryTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="box-none" style={{position:"absolute",bottom:0,left:0,right:0,paddingHorizontal:11,paddingBottom:Math.max(9,insets.bottom)+4}}>
    <LinearGradient colors={["rgba(37,38,52,0.97)","rgba(9,10,17,0.98)"]}
      style={{flexDirection:"row",borderWidth:1,borderColor:"#34394C",borderRadius:22,
        paddingHorizontal:6,paddingTop:8,paddingBottom:7,elevation:16,shadowColor:"#00B5FF",shadowOpacity:0.16,shadowRadius:18}}>
      {PRIMARY.map(item => {
        const route=state.routes.find((r:any)=>r.name===item.name);
        if(!route)return null;
        const index=state.routes.findIndex((r:any)=>r.key===route.key);
        const active=state.index===index;
        return <Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.label}
          accessibilityState={{selected:active}} testID={"tab-"+item.name}
          onPress={()=>{
            const event=navigation.emit({type:"tabPress",target:route.key,canPreventDefault:true});
            if(!event.defaultPrevented)navigation.navigate(item.name);
          }}
          style={{flex:1,alignItems:"center",gap:3,minHeight:53,justifyContent:"center"}}>
          <View style={{height:35,minWidth:43,alignItems:"center",justifyContent:"center",
            borderRadius:12,backgroundColor:active?item.color+"2D":"transparent",borderWidth:active?1:0,
            borderColor:item.color+"80"}}>
            <Icon name={active?item.active:item.icon} size={23} color={active?item.color:"#A9B0BF"}/>
          </View>
          <Text numberOfLines={1} style={{fontSize:10,fontWeight:active?"900":"700",color:active?item.color:"#9EA5B2"}}>{item.label}</Text>
        </Pressable>;
      })}
    </LinearGradient>
  </View>;
}
export default function TabsLayout() {
  return <Tabs initialRouteName="vault" tabBar={p=><PrimaryTabBar {...p}/>} screenOptions={{headerShown:false}}>
    <Tabs.Screen name="account-hub"/>
    <Tabs.Screen name="subscriptions"/>
    <Tabs.Screen name="prompts"/>
    <Tabs.Screen name="vault"/>
    <Tabs.Screen name="brain"/>
    <Tabs.Screen name="index" options={{href:null}}/>
    <Tabs.Screen name="renewals" options={{href:null}}/>
    <Tabs.Screen name="spending" options={{href:null}}/>
    <Tabs.Screen name="inbox" options={{href:null}}/>
    <Tabs.Screen name="ai" options={{href:null}}/>
  </Tabs>;
}
