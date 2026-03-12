import React, { useState } from "react";
import { ActionIcon, Button, Group, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export function LabelWithInfo({ label, info }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="sm">{label}</Text>
      <Tooltip label={info} multiline w={260} withArrow>
        <ActionIcon variant="subtle" size="xs" color="gray" radius="xl">
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function SaveButton({ label, onSave }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  return (
    <Button
      size="xs"
      variant="light"
      loading={status === "saving"}
      color={status === "saved" ? "green" : status === "error" ? "red" : "blue"}
      disabled={status === "saved"}
      onClick={async () => {
        setStatus("saving");
        try {
          await onSave();
          setStatus("saved");
        } catch (err) {
          console.error("[SaveButton] Save failed:", err);
          setStatus("error");
        }
      }}
    >
      {status === "saved" ? t("competitorLookup.saved") : status === "error" ? t("competitorLookup.retry") : label || t("competitorLookup.save")}
    </Button>
  );
}

export function SaveAllButton({ items, onSave, type = "post" }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  if (!items?.length || items.length <= 1) return null;

  return (
    <Button
      size="xs"
      variant="filled"
      loading={status === "saving"}
      color={status === "saved" ? "green" : status === "error" ? "orange" : "blue"}
      disabled={status === "saved"}
      onClick={async () => {
        setStatus("saving");
        setProgress({ done: 0, total: items.length, failed: 0 });
        let failed = 0;
        for (let i = 0; i < items.length; i++) {
          try {
            await onSave(type, items[i]);
          } catch (err) {
            console.error(`[SaveAll] Item ${i} failed:`, err);
            failed++;
          }
          setProgress(p => ({ ...p, done: i + 1, failed }));
        }
        setStatus(failed === items.length ? "error" : "saved");
      }}
    >
      {status === "saving"
        ? t("competitorLookup.savingProgress", { done: progress.done, total: progress.total })
        : status === "saved"
          ? t("competitorLookup.savedAll", { failed: progress.failed })
          : status === "error"
            ? t("competitorLookup.allFailedRetry")
            : t("competitorLookup.saveAllCount", { count: items.length })}
    </Button>
  );
}
