// client/components/NavbarSimple.jsx
import { useState } from "react";
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
import { Image } from "@mantine/core";
import classes from "./NavbarSimple.module.css";

import Logo from "./logo.png";

const FADE_MS = 140;

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
      data-active={active ? "true" : undefined}
      onClick={onClick}
    >
      <Icon className={classes.linkIcon} stroke={1.6} />
      <span className={classes.linkLabel}>{item.label}</span>
    </button>
  );
}

export function NavbarSimple() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isFading, setIsFading] = useState(false);

  const handleNavigate = (path) => {
    if (path === location.pathname) return;

    setIsFading(true);
    setTimeout(() => {
      navigate(path);
      setTimeout(() => setIsFading(false), 40);
    }, FADE_MS);
  };

  return (
    <nav className={classes.navbar} data-fading={isFading ? "1" : "0"}>
      <div className={classes.navbarMain}>
        <div className={classes.header}>
          <Image src={Logo} alt="Chibitek" className={classes.logo} fit="contain" />
        </div>

        <div className={classes.links}>
          {linksData.map((item) => (
            <NavItem
              key={item.label}
              item={item}
              active={location.pathname === item.path}
              onClick={() => handleNavigate(item.path)}
            />
          ))}
        </div>
      </div>

      <div className={classes.footer}>
        <button type="button" className={classes.link}>
          <IconSwitchHorizontal className={classes.linkIcon} stroke={1.6} />
          <span className={classes.linkLabel}>Change account</span>
        </button>

        <button type="button" className={classes.link}>
          <IconLogout className={classes.linkIcon} stroke={1.6} />
          <span className={classes.linkLabel}>Logout</span>
        </button>
      </div>
    </nav>
  );
}
