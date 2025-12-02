import { useLocation, useNavigate } from "react-router-dom";
import {
  IconGauge,
  IconSearch,
  IconBuildingFactory,
  IconReport,
  IconMessage,
  IconSettings,
  IconSwitchHorizontal,
  IconLogout,
} from "@tabler/icons-react";
import { Group, Text } from "@mantine/core";
import classes from "./NavbarSimple.module.css";

const linksData = [
  { label: "Dashboard", icon: IconGauge, path: "/" },
  { label: "Keyword Tracking", icon: IconSearch, path: "/keywords" },
  { label: "Competitor Tracking", icon: IconBuildingFactory, path: "/competitors" },
  { label: "Reports", icon: IconReport, path: "/reports" },
  { label: "Chat (AI)", icon: IconMessage, path: "/chat" },
  { label: "Settings", icon: IconSettings, path: "/settings" },
];

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      className={classes.link}
      data-active={active || undefined}
      onClick={onClick}
    >
      <Icon className={classes.linkIcon} stroke={1.6} />
      <span>{item.label}</span>
    </button>
  );
}

export function NavbarSimple() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className={classes.navbar}>
      <div className={classes.navbarMain}>
        <Group className={classes.header} justify="space-between">
          <Text fw={700} size="xl">
            Chibitek Competitive Platform
          </Text>
          <Text size="xs" c="dimmed">
            v0.1
          </Text>
        </Group>

        {linksData.map((item) => (
          <NavItem
            key={item.label}
            item={item}
            active={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          />
        ))}
      </div>

      <div className={classes.footer}>
        <button
          type="button"
          className={classes.link}
          onClick={() => {}}
        >
          <IconSwitchHorizontal className={classes.linkIcon} stroke={1.6} />
          <span>Change account</span>
        </button>

        <button
          type="button"
          className={classes.link}
          onClick={() => {}}
        >
          <IconLogout className={classes.linkIcon} stroke={1.6} />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
