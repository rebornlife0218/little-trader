# 第 1 章「什麼資料用什麼圖？」的 R 圖檔產生程式(深色、淺色主題各一張，樣式見 theme.R)
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch01-figures.R web/content/stats/basic/img
# 需要套件：MASS(R 內建)、mfp(install.packages("mfp"))；Protein 資料從網路讀取
.dir <- dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)))
source(file.path(.dir, "theme.R"))
library(MASS)
library(mfp)
data(bodyfat)
protein <- read.table("https://raw.githubusercontent.com/WinVector/zmPDSwR/master/Protein/protein.txt",
                      sep = "\t", header = TRUE)
race <- factor(birthwt$race, labels = c("White", "African-American", "Other"))
smoke <- factor(birthwt$smoke, labels = c("No", "Yes"))
low <- factor(birthwt$low, labels = c("Normal", "Low"))
W <- 820; H <- 540

# ---- 一個類別變數 ----
lt_fig("ch01-bar", W, H, function(T) {
  tb <- table(Pima.tr$type)
  b <- barplot(tb, col = T$blue, border = NA, ylim = c(0, max(tb) * 1.15), main = "Bar graph: type (Pima.tr)", xlab = "type", ylab = "Frequency", axes = FALSE)
  lt_grid(T, FALSE); barplot(tb, col = T$blue, border = NA, add = TRUE, axes = FALSE); axis(2, lwd = 0)
  text(b, tb, tb, pos = 3, col = T$fg, cex = 0.9)
})
lt_fig("ch01-pie", W, H, function(T) {
  tb <- table(race); cols <- c(T$blue, T$amber, T$grey)
  layout(matrix(1:2, 1), widths = c(1.25, 1))               # 左邊圓餅、右邊圖例
  par(mar = c(1, 1, 2.6, 0))
  pie(tb, labels = NA, col = cols, border = T$hole, radius = 0.95, init.angle = 90, clockwise = TRUE)
  mtext("Pie chart: race (birthwt)", side = 3, line = 0.6, adj = 0.15, font = 2, col = T$fg)
  par(mar = c(1, 0, 2.6, 1)); plot.new()
  lt_legend(T, "left", sprintf("%s  %.0f%%", names(tb), 100 * tb / sum(tb)), cols, pch = 15, pt.cex = 2.2, y.intersp = 1.6)
})

# ---- 一個數值變數 ----
lt_fig("ch01-hist", W, H, function(T) {
  h <- hist(Pima.tr$bmi, plot = FALSE)
  lt_frame(T, range(h$breaks), c(0, max(h$counts) * 1.08), main = "Histogram: bmi (Pima.tr)", xlab = "bmi", ylab = "Frequency", vertical = FALSE)
  plot(h, col = T$blue, border = T$hole, add = TRUE)
})
lt_fig("ch01-box", W, 420, function(T) {
  boxplot(birthwt$bwt, horizontal = TRUE, col = lt_alpha(T$blue, 0.55), border = T$blue, medcol = T$amber, whiskcol = T$blue, staplecol = T$blue,
          outcol = T$amber, outpch = 19, main = "Boxplot: bwt (birthwt)", xlab = "bwt (g)", axes = FALSE, frame.plot = FALSE)
  lt_grid(T); axis(1, lwd = 0)
  boxplot(birthwt$bwt, horizontal = TRUE, col = lt_alpha(T$blue, 0.55), border = T$blue, medcol = T$amber, medlwd = 3, whiskcol = T$blue, staplecol = T$blue,
          outcol = T$amber, outpch = 19, add = TRUE, axes = FALSE)
})

# ---- 兩個數值變數 ----
lt_fig("ch01-scatter", W, H, function(T) {
  lt_frame(T, range(bodyfat$abdomen), range(bodyfat$siri), main = "Scatter plot: siri vs abdomen (bodyfat)", xlab = "abdomen (cm)", ylab = "siri (% body fat)")
  points(siri ~ abdomen, data = bodyfat, pch = 19, cex = 0.7, col = lt_alpha(T$blue, 0.7))
  abline(lm(siri ~ abdomen, data = bodyfat), col = T$amber, lwd = 2.5)
})
lt_fig("ch01-pairs", W, 760, function(T) {
  panel.hist <- function(x, ...) {
    usr <- par("usr"); par(usr = c(usr[1:2], 0, 1.5))
    h <- hist(x, plot = FALSE); y <- h$counts / max(h$counts)
    rect(h$breaks[-length(h$breaks)], 0, h$breaks[-1], y, col = lt_alpha(T$amber, 0.6), border = T$hole)
  }
  pairs(protein[, c("Cereals", "Eggs", "RedMeat", "Fish")], diag.panel = panel.hist, pch = 19, cex = 0.8, col = lt_alpha(T$blue, 0.75),
        main = "Scatterplot matrix (Protein)", col.axis = T$mute, fg = T$grid, font.labels = 2, cex.labels = 1.2, gap = 0.6)
})
lt_fig("ch01-line", W, H, function(T) {
  lt_frame(T, range(time(AirPassengers)), c(0, max(AirPassengers) * 1.05), main = "Line chart: AirPassengers", xlab = "Year", ylab = "Passengers (1000s)")
  lines(AirPassengers, col = T$blue, lwd = 2)
})

# ---- 兩個類別變數 ----
lt_fig("ch01-groupbar", W, H, function(T) {
  tb <- table(smoke, race)
  barplot(tb, beside = TRUE, col = c(T$blue, T$amber), border = NA, ylim = c(0, max(tb) * 1.2), main = "Grouped bar: race by smoke (birthwt)", xlab = "race", ylab = "Frequency", axes = FALSE)
  lt_grid(T, FALSE)
  barplot(tb, beside = TRUE, col = c(T$blue, T$amber), border = NA, add = TRUE, axes = FALSE); axis(2, lwd = 0)
  lt_legend(T, "topright", c("smoke = No", "smoke = Yes"), c(T$blue, T$amber), pch = 15, pt.cex = 1.6)
})
lt_fig("ch01-mosaic", W, H, function(T) {
  mosaicplot(table(smoke, low), color = c(T$grey, T$amber), border = T$hole, main = "Mosaic plot: smoke vs low (birthwt)", xlab = "smoke", ylab = "low", cex.axis = 0.9)
})

# ---- 一個數值變數 × 一個類別變數 ----
lt_fig("ch01-strip", W, H, function(T) {
  lt_frame(T, c(0.5, 2.5), range(cabbages$VitC) + c(-3, 3), main = "Strip chart: VitC by Cult (cabbages)", xlab = "Cult", ylab = "VitC", xaxt = "n", vertical = FALSE)
  axis(1, at = 1:2, labels = levels(cabbages$Cult), lwd = 0)
  stripchart(VitC ~ Cult, data = cabbages, vertical = TRUE, method = "jitter", jitter = 0.12, pch = 19, cex = 0.9, col = lt_alpha(c(T$blue, T$amber), 0.8), add = TRUE)
})
lt_fig("ch01-groupbox", W, H, function(T) {
  lt_frame(T, c(0.5, 2.5), range(cabbages$VitC) + c(-3, 3), main = "Boxplot by group: VitC by Cult (cabbages)", xlab = "Cult", ylab = "VitC", xaxt = "n", vertical = FALSE)
  boxplot(VitC ~ Cult, data = cabbages, col = lt_alpha(c(T$blue, T$amber), 0.5), border = c(T$blue, T$amber), medlwd = 3, outpch = 19,
          add = TRUE, axes = FALSE)
  axis(1, at = 1:2, labels = levels(cabbages$Cult), lwd = 0)
})
