import { Column, Text } from "@expo/ui/jetpack-compose";
import { background, fillMaxWidth, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget } from "expo-widgets";

export type SubMindWidgetProps = {
  expiringCount: number;
  expiryTitle: string;
  expiryWhen: string;
  notesCount: number;
  noteTitle: string;
  linksCount: number;
  linkTitle: string;
  linkWhen: string;
};

// Separate, isolated Android widget runtime: do not import app state, call
// network APIs, use React hooks, or display account emails/private tokens here.
const SubMindOverview = (props: SubMindWidgetProps) => {
  "widget";
  return (
    <Column modifiers={[background("#070707"), paddingAll(12), fillMaxWidth()]}>
      <Text color="#FFFFFF" style={{ fontSize: 17, fontWeight: "bold" }}>
        SUBMIND
      </Text>
      <Text color="#B0B0B0" style={{ fontSize: 11 }}>
        your things, at a glance
      </Text>

      <Column modifiers={[background("#6500D9"), paddingAll(10), fillMaxWidth()]}>
        <Text color="#FFFFFF" style={{ fontSize: 11, fontWeight: "bold" }}>
          SUBSCRIPTIONS EXPIRING  ·  {props.expiringCount}
        </Text>
        <Text color="#FFFFFF" maxLines={1} overflow="ellipsis"
          style={{ fontSize: 16, fontWeight: "bold" }}>
          {props.expiryTitle}
        </Text>
        <Text color="#EFE3FF" style={{ fontSize: 11 }}>
          {props.expiryWhen}
        </Text>
      </Column>

      <Column modifiers={[background("#087AAA"), paddingAll(10), fillMaxWidth()]}>
        <Text color="#FFFFFF" style={{ fontSize: 11, fontWeight: "bold" }}>
          NOTES  ·  {props.notesCount}
        </Text>
        <Text color="#FFFFFF" maxLines={2} overflow="ellipsis" style={{ fontSize: 15 }}>
          {props.noteTitle}
        </Text>
      </Column>

      <Column modifiers={[background("#008D19"), paddingAll(10), fillMaxWidth()]}>
        <Text color="#FFFFFF" style={{ fontSize: 11, fontWeight: "bold" }}>
          REMINDER LINKS  ·  {props.linksCount}
        </Text>
        <Text color="#FFFFFF" maxLines={1} overflow="ellipsis"
          style={{ fontSize: 15, fontWeight: "bold" }}>
          {props.linkTitle}
        </Text>
        <Text color="#E5FFEC" style={{ fontSize: 11 }}>
          {props.linkWhen}
        </Text>
      </Column>
    </Column>
  );
};

export default createWidget<SubMindWidgetProps>(
  "SubMindOverview",
  SubMindOverview,
  {
    expiringCount: 0,
    expiryTitle: "Nothing expiring soon",
    expiryWhen: "Open SubMind to refresh",
    notesCount: 0,
    noteTitle: "Add a note in SubMind",
    linksCount: 0,
    linkTitle: "No links with reminders",
    linkWhen: "Open SubMind to refresh",
  },
);
