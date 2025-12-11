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
    { keyword: "fiction", freq: 12 },
    { keyword: "nonfiction", freq: 7 },
    { keyword: "history", freq: 5 },
    { keyword: "cooking", freq: 9 },
    { keyword: "biography", freq: 4 },
  ];

  return (
    <div ref={ref}>
      <Card shadow="sm" p="lg" radius="md">
        <Title order={3} mb="md">
          Keyword Frequency Chart
        </Title>

        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={data}
            margin={{ top: 40, right: 20, left: 20, bottom: 20 }} // <-- pushes chart down
          >
            {/* Chart Title */}
            <text
              x="50%"
              y={20} // stays near the top
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: "16px", fontWeight: "bold" }}
            >
              Sample Data #1
            </text>

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
