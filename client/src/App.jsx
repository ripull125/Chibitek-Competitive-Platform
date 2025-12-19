// client/src/App.jsx
import React from "react";
import {
  AppShell,
  Group,
  Title,
  Burger,
  ScrollArea,
} from "@mantine/core";
import { Outlet } from "react-router-dom";
import { useDisclosure } from "@mantine/hooks";
import NavbarSimple from "../components/NavbarSimple.jsx";

const HEADER_HEIGHT = 56; // keep in sync with header.height

export default function App() {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      padding="lg"
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>Chibitek Dashboard</Title>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <NavbarSimple />
      </AppShell.Navbar>

      <AppShell.Main>
        {/* Only the page content scrolls; navbar/header remain fixed */}
        <ScrollArea
          type="auto"
          scrollbarSize={10}
          h={`calc(100dvh - ${HEADER_HEIGHT}px)`}
        >
          <Outlet />
        </ScrollArea>
      </AppShell.Main>
    </AppShell>
  );
}
