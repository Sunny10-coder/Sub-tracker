import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll, useReminders } from "@/src/lib/api";
import { formatDate, relativeDate, daysUntil } from "@/src/lib/format";
import { AppHeader, Card, EmptyState, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Reminders() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, refetch } = useReminders();
  const invalidate = useInvalidateAll();

  const toggle = useMutation({ mutationFn: ({ id, completed }: any) => api.updateReminder(id, { completed }), onSuccess: () => { refetch(); invalidate(); } });
  const del = useMutation({ mutationFn: (id: string) => api.deleteReminder(id), onSuccess: () => { refetch(); invalidate(); } });

  const kindIcon: any = { renewal: "calendar-refresh", trial_ending: "clock-alert-outline", offer_expiry: "tag-outline", custom: "bell-outline" };

  return (
    <View style={styles.container}>
      <AppHeader title="Reminders" back right={<Pressable onPress={() => router.push("/add-reminder")} testID="add-reminder-btn"><Icon name="plus-circle" size={28} color={colors.brandPrimary} /></Pressable>} />
      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon="bell-outline" title="No reminders" message="Never miss a renewal or trial ending. Add your first reminder." action={<PrimaryButton title="New reminder" icon="plus" onPress={() => router.push("/add-reminder")} style={{ marginTop: 8 }} />} />}
          renderItem={({ item }) => {
            const overdue = (daysUntil(item.due_date) ?? 0) < 0 && !item.completed;
            return (
              <Card style={styles.row} testID={`reminder-${item.id}`}>
                <Pressable onPress={() => toggle.mutate({ id: item.id, completed: !item.completed })} style={[styles.check, item.completed && { backgroundColor: colors.success, borderColor: colors.success }]}>
                  {item.completed ? <Icon name="check" size={16} color={colors.onSuccess} /> : null}
                </Pressable>
                <View style={styles.iconBox}><Icon name={kindIcon[item.kind] || "bell-outline"} size={18} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, item.completed && styles.done]} numberOfLines={2}>{item.title}</Text>
                  <Text style={[styles.date, overdue && { color: colors.error }]}>{formatDate(item.due_date)} · {relativeDate(item.due_date)}</Text>
                </View>
                <Pressable onPress={() => del.mutate(item.id)} hitSlop={10}><Icon name="close" size={20} color={colors.muted} /></Pressable>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandPrimary + "16", alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
  done: { textDecorationLine: "line-through", color: colors.muted },
  date: { color: colors.muted, fontSize: 13, marginTop: 3, fontWeight: "600" },
}));
