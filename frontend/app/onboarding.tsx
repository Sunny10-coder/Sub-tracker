import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const SLIDES = [
  {
    icon: "brain",
    title: "Your subscription brain",
    body: "SubMind tracks subscriptions, trials, renewals and spending — so nothing slips through unnoticed.",
  },
  {
    icon: "auto-fix",
    title: "Share anything, we understand it",
    body: "Drop in a screenshot, a link or a note. AI extracts the plan, price and renewal date automatically.",
  },
  {
    icon: "comment-question-outline",
    title: "Ask anything, anytime",
    body: "“What renews this month?” “Which trials end soon?” Ask SubMind and get answers from your own data.",
  },
];

export default function Onboarding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [i, setI] = useState(0);

  const next = async () => {
    if (i < SLIDES.length - 1) {
      setI(i + 1);
    } else {
      await storage.setItem("onboarded", true);
      router.replace("/(tabs)");
    }
  };

  const s = SLIDES[i];
  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient
        colors={[colors.brandPrimary, colors.brand, colors.brandSecondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroInner}>
          <Icon name={s.icon} size={92} color={colors.onBrandPrimary} />
        </View>
        <Text style={styles.brand}>SubMind</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} testID="onboarding-title">{s.title}</Text>
        <Text style={styles.desc}>{s.body}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, idx) => (
            <View key={idx} style={[styles.dot, idx === i && styles.dotActive, { width: idx === i ? 24 : 8 }]} />
          ))}
        </View>
        <PrimaryButton
          title={i === SLIDES.length - 1 ? "Get started" : "Continue"}
          icon="arrow-right"
          onPress={next}
          testID="onboarding-next"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24 },
  hero: { flex: 1, borderRadius: 32, alignItems: "center", justifyContent: "center", marginTop: 8, gap: 16 },
  heroInner: {
    width: 150, height: 150, borderRadius: 44, backgroundColor: "#FFFFFF22",
    alignItems: "center", justifyContent: "center",
  },
  brand: { color: colors.onBrandPrimary, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  body: { paddingTop: 28, gap: 12 },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  desc: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  footer: { gap: 20 },
  dots: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  dot: { height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brandPrimary },
}));
