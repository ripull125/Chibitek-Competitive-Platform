import { forwardRef } from "react";
import { Card, Title } from "@mantine/core";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const KeywordTracking = forwardRef((props, ref) => {
  const data = [
    { keyword: "React", freq: 12 },
    { keyword: "API", freq: 7 },
    { keyword: "Database", freq: 5 },
    { keyword: "Auth", freq: 9 },
    { keyword: "Routing", freq: 4 },
  ];

  return (
    <div ref={ref}>
      <Card shadow="sm" p="lg" radius="md">
        <Title order={3}>Keyword Tracking (Frequency)</Title>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="keyword" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="freq" fill="#4dabf7" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
});

export default KeywordTracking;
