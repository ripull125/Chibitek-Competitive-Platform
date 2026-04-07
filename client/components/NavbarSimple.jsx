// client/components/NavbarSimple.jsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconBookmark,
  IconReport,
  IconMessage,
  IconSettings,
  IconLogout,
  IconTrendingUp,
  IconLayoutDashboard,
  IconRobot,
} from "@tabler/icons-react";
import { Avatar, Image } from "@mantine/core";
import classes from "./NavbarSimple.module.css";

import { supabase } from "../src/supabaseClient";
import { storeSession } from "../src/auth/session";

import Logo from "./logo.png";

const FADE_MS = 140;

const linksData = [
  { key: "dashboard", icon: IconLayoutDashboard, path: "/" },
  { key: "competitorLookup", icon: IconSearch, path: "/competitor-lookup" },
  { key: "savedPosts", icon: IconBookmark, path: "/savedPosts" },
  { key: "keywordTracking", icon: IconTrendingUp, path: "/keywords" },
  { key: "watchlist", icon: IconRobot, path: "/watchlist" },
  { key: "reports", icon: IconReport, path: "/reports" },
  { key: "chat", icon: IconMessage, path: "/chat" },
  { key: "settings", icon: IconSettings, path: "/settings" },
];

function NavItem({ item, active, onClick }) {
  const { t } = useTranslation();
  const Icon = item.icon;

  return (
    <button
      type="button"
      className={classes.link}
      data-active={active ? "true" : undefined}
      onClick={onClick}
    >
      <Icon className={classes.linkIcon} stroke={1.6} />
      <span className={classes.linkLabel}>{t(`nav.${item.key}`)}</span>
    </button>
  );
}

export function NavbarSimple() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [isFading, setIsFading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    let mounted = true;

    const resolveAvatar = async () => {
      try {
        const { data } = await supabase?.auth?.getUser?.();
        const user = data?.user;
        if (!mounted || !user) return;

        const meta = user.user_metadata || {};
        const direct = String(meta.avatar_url || meta.picture || meta.avatar || "").trim();
        if (direct) {
          setAvatarUrl(direct);
          return;
        }

        const identities = Array.isArray(user.identities) ? user.identities : [];
        for (const identity of identities) {
          const identityData = identity?.identity_data || {};
          const url = String(
            identityData.avatar_url || identityData.picture || identityData.avatar || ""
          ).trim();
          if (url) {
            setAvatarUrl(url);
            return;
          }
        }
      } catch {
        setAvatarUrl("");
      }
    };

    resolveAvatar();

    return () => {
      mounted = false;
    };
  }, []);

  const handleNavigate = (path) => {
    if (path === location.pathname) return;

    setIsFading(true);
    setTimeout(() => {
      navigate(path);
      setTimeout(() => setIsFading(false), 40);
    }, FADE_MS);
  };

  const handleLogout = async () => {
    try {
      storeSession(null);
      await supabase?.auth?.signOut?.();
    } finally {
      navigate("/login", { replace: true });
    }
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
              key={item.path}
              item={item}
              active={location.pathname === item.path}
              onClick={() => handleNavigate(item.path)}
            />
          ))}
        </div>
      </div>

      <div className={classes.footer}>
        <div className={classes.footerAvatarWrap}>
          <Avatar
            src={avatarUrl || undefined}
            alt={t("profile.profilePictureAlt")}
            radius="xl"
            size={38}
            className={classes.footerAvatar}
          />
        </div>

        <button type="button" className={classes.link} onClick={handleLogout}>
          <IconLogout className={classes.linkIcon} stroke={1.6} />
          <span className={classes.linkLabel}>{t("nav.logout")}</span>
        </button>
      </div>
    </nav>
  );
}
