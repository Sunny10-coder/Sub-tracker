import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll } from "@/src/lib/api";
import { CURRENCIES, CYCLES } from "@/src/lib/format";
import { AppHeader, PrimaryButton } from "@/src/components/ui";
import { FormScroll, SelectField, TextField } from "@/src/components/form";
import { makeStyles } from "@/src/theme";

export default function AddPlan() {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [f, setF] = useState<any>({ provider: "", plan: "", price: "", currency: "AED", billing_cycle: "monthly", url: "", offer_expiry: "", notes: "" });
  const set = (k: string) => (v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: () => api.createPlan({ ...f, price: f.price ? parseFloat(f.price) : null, offer_expiry: f.offer_expiry || null }),
    onSuccess: () => { invalidate(); router.replace("/watchlist"); },
  });

  return (
    <View style={styles.container}>
      <AppHeader title="Add plan to watch" back />
      <FormScroll>
        <TextField label="Provider" value={f.provider} onChangeText={set("provider")} placeholder="Midjourney, Framer…" testID="plan-provider" />
        <TextField label="Plan" value={f.plan} onChangeText={set("plan")} placeholder="Pro" testID="plan-plan" />
        <TextField label="Price" value={f.price} onChangeText={set("price")} placeholder="99" keyboardType="decimal-pad" testID="plan-price" />
        <SelectField label="Currency" options={CURRENCIES} value={f.currency} onChange={set("currency")} testID="plan-currency" />
        <SelectField label="Billing cycle" options={CYCLES} value={f.billing_cycle} onChange={set("billing_cycle")} testID="plan-cycle" />
        <TextField label="URL (optional)" value={f.url} onChangeText={set("url")} placeholder="https://…" testID="plan-url" />
        <TextField label="Offer expiry (optional)" value={f.offer_expiry} onChangeText={set("offer_expiry")} placeholder="YYYY-MM-DD" testID="plan-offer" />
        <TextField label="Notes" value={f.notes} onChangeText={set("notes")} placeholder="Why watch this?" multiline testID="plan-notes" />
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Save to watchlist" icon="eye-plus" onPress={() => save.mutate()} loading={save.isPending} disabled={!f.provider} testID="plan-save" />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
