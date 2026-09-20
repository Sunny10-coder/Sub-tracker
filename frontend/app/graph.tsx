import { useMemo, useState } from "react";
import { Dimensions, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGraph } from "@/src/lib/api";
import { AppHeader, EmptyState, Loading } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Graph() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useGraph();
  const [selected, setSelected] = useState<any>(null);

  const W = Dimensions.get("window").width - 32;
  const H = 520;

  const typeColor: Record<string, string> = {
    subscription: colors.accentRed,
    link: colors.accentBlue,
    plan: colors.accentGreen,
    category: colors.accentPurple,
    tag: colors.accentYellow,
  };

  const layout = useMemo(() => {
    if (!data?.nodes?.length) return null;
    const nodes = data.nodes;
    const n = nodes.length;
    const cx = W / 2;
    const cy = H / 2;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const scale = Math.min(W, H) / 2.4 / Math.sqrt(n);
    const pos: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node: any, i: number) => {
      const r = scale * Math.sqrt(i + 0.5);
      const a = i * golden;
      pos[node.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
    return { nodes, edges: data.edges || [], pos };
  }, [data, W]);

  return (
    <View style={styles.container}>
      <AppHeader title="Brain Map" subtitle="How your data connects" back />
      {isLoading ? (
        <Loading />
      ) : !layout ? (
        <EmptyState icon="graph-outline" title="Nothing to map yet" message="Add subscriptions and links, and SubMind will connect them by category and tags here." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          {selected ? (
            <View style={[styles.selBar, { backgroundColor: (typeColor[selected.type] || colors.brandPrimary) + "22" }]}>
              <Text style={styles.selType}>{selected.type.toUpperCase()}</Text>
              <Text style={styles.selLabel}>{selected.label}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>Tap any node to inspect it</Text>
          )}

          <View style={{ alignItems: "center" }}>
            <Svg width={W} height={H}>
              {layout.edges.map((e: any, i: number) => {
                const a = layout.pos[e.source]; const b = layout.pos[e.target];
                if (!a || !b) return null;
                return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.border} strokeWidth={1} />;
              })}
              {layout.nodes.map((node: any) => {
                const p = layout.pos[node.id];
                const hub = node.type === "category" || node.type === "tag";
                const r = hub ? 12 : 9;
                return (
                  <Circle
                    key={node.id}
                    cx={p.x}
                    cy={p.y}
                    r={selected?.id === node.id ? r + 4 : r}
                    fill={typeColor[node.type] || colors.brandPrimary}
                    stroke={colors.surface}
                    strokeWidth={2}
                    onPress={() => setSelected(node)}
                  />
                );
              })}
              {layout.nodes.filter((nd: any) => nd.type === "category" || nd.type === "tag").map((node: any) => {
                const p = layout.pos[node.id];
                return (
                  <SvgText key={"t" + node.id} x={p.x} y={p.y - 16} fontSize={11} fontWeight="700" fill={colors.onSurface} textAnchor="middle">
                    {node.label}
                  </SvgText>
                );
              })}
            </Svg>
          </View>

          <View style={styles.legend}>
            {Object.entries(typeColor).map(([k, c]) => (
              <View key={k} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={styles.legendText}>{k}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  hint: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 12 },
  selBar: { marginHorizontal: 16, marginVertical: 10, borderRadius: 16, padding: 14 },
  selType: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  selLabel: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center", paddingHorizontal: 20, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
}));
