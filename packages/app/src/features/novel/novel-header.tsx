import { useCallback, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";

interface NovelScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children?: ReactNode;
  backTestID?: string;
}

export function NovelScreenHeader({
  title,
  subtitle,
  onBack,
  children,
  backTestID,
}: NovelScreenHeaderProps) {
  const { t } = useTranslation();
  const backIcon = useMemo(() => <ArrowLeft size={14} color="#9ca3af" />, []);
  const handleBack = useCallback(() => onBack(), [onBack]);
  return (
    <>
      <TitlebarDragRegion />
      <View style={styles.header}>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={backIcon}
          onPress={handleBack}
          testID={backTestID}
        >
          {t("common.actions.back")}
        </Button>
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>{children}</View>
      </View>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
