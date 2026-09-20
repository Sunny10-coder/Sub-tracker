import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll } from "@/src/lib/api";
import { CATEGORIES, CURRENCIES, CYCLES, STATUSES } from "@/src/lib/format";
import { AppHeader, PrimaryButton } from "@/src/components/ui";
import { FormScroll, SelectField, TextField } from "@/src/components/form";
import { makeStyles } from "@/src/theme";

export default function AddSubscription() {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [f, setF] = useState<any>({
    provider: "", product: "", plan: "", category: "Other", status: "Active",
    price: "", currency: "AED", billing_cycle: "monthly", renewal_date: "", trial_end: "", notes: "",
  });
  const set = (k: string) => (v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: () => api.createSubscription({
      ...f, price: f.price ? parseFloat(f.price) : null,
      renewal_date: f.renewal_date || null, trial_end: f.trial_end || null, create_reminder: true,
    }),
    onSuccess: () => { invalidate(); router.back(); },
  });

  return (
    <View style={styles.container}>
      <AppHeader title="Add subscription" back />
      <FormScroll>
        <TextField label="Provider" value={f.provider} onChangeText={set("provider")} placeholder="Netflix, Spotify…" testID="f-provider" />
        <TextField label="Product / service" value={f.product} onChangeText={set("product")} placeholder="Premium" testID="f-product" />
        <TextField label="Plan name" value={f.plan} onChangeText={set("plan")} placeholder="Individual" testID="f-plan" />
        <SelectField label="Category" options={CATEGORIES} value={f.category} onChange={set("category")} testID="f-category" />
        <SelectField label="Status" options={STATUSES} value={f.status} onChange={set("status")} testID="f-status" />
        <TextField label="Price" value={f.price} onChangeText={set("price")} placeholder="79.99" keyboardType="decimal-pad" testID="f-price" />
        <SelectField label="Currency" options={CURRENCIES} value={f.currency} onChange={set("currency")} testID="f-currency" />
        <SelectField label="Billing cycle" options={CYCLES} value={f.billing_cycle} onChange={set("billing_cycle")} testID="f-cycle" />
        <TextField label="Renewal date" value={f.renewal_date} onChangeText={set("renewal_date")} placeholder="YYYY-MM-DD" testID="f-renewal" />
        <TextField label="Trial end (optional)" value={f.trial_end} onChangeText={set("trial_end")} placeholder="YYYY-MM-DD" testID="f-trial" />
        <TextField label="Notes" value={f.notes} onChangeText={set("notes")} placeholder="Anything to remember" multiline testID="f-notes" />
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Save subscription" icon="check" onPress={() => save.mutate()} loading={save.isPending} disabled={!f.provider} testID="save-subscription" />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
