# 第 1 章「什麼資料用什麼圖？」的 R 圖檔產生程式
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch01-figures.R web/content/stats/basic/img
# 需要套件：MASS(R 內建)、mfp(install.packages("mfp"))；Protein 資料從網路讀取
library(MASS)
library(mfp)
data(bodyfat)
protein <- read.table("https://raw.githubusercontent.com/WinVector/zmPDSwR/master/Protein/protein.txt",
                      sep = "\t", header = TRUE)
out <- commandArgs(TRUE)[1]
dev <- function(f, w = 760, h = 520) png(file.path(out, f), width = w, height = h, res = 120, type = "cairo")
race <- factor(birthwt$race, labels = c("White", "African-American", "Other"))
smoke <- factor(birthwt$smoke, labels = c("No", "Yes"))
low <- factor(birthwt$low, labels = c("Normal", "Low"))

# ---- 一個類別變數 ----
dev("ch01-bar.png"); barplot(table(Pima.tr$type), col = "steelblue", main = "Bar graph: type (Pima.tr)", xlab = "type", ylab = "Frequency"); dev.off()
dev("ch01-pie.png"); pie(table(race), col = c("steelblue", "orange", "grey70"), main = "Pie chart: race (birthwt)"); dev.off()

# ---- 一個數值變數 ----
dev("ch01-hist.png"); hist(Pima.tr$bmi, col = "steelblue", border = "white", main = "Histogram: bmi (Pima.tr)", xlab = "bmi"); dev.off()
dev("ch01-box.png"); boxplot(birthwt$bwt, horizontal = TRUE, col = "steelblue", main = "Boxplot: bwt (birthwt)", xlab = "bwt (g)"); dev.off()

# ---- 兩個數值變數 ----
dev("ch01-scatter.png"); plot(siri ~ abdomen, data = bodyfat, col = "steelblue", main = "Scatter plot: siri vs abdomen (bodyfat)", xlab = "abdomen (cm)", ylab = "siri (% body fat)"); abline(lm(siri ~ abdomen, data = bodyfat), col = "orange", lwd = 2); dev.off()
panel.hist <- function(x, ...) {
  usr <- par("usr"); par(usr = c(usr[1:2], 0, 1.5))
  h <- hist(x, plot = FALSE); y <- h$counts / max(h$counts)
  rect(h$breaks[-length(h$breaks)], 0, h$breaks[-1], y, col = "grey80")
}
dev("ch01-pairs.png", 760, 720); pairs(protein[, c("Cereals", "Eggs", "RedMeat", "Fish")], diag.panel = panel.hist, col = "steelblue", main = "Scatterplot matrix (Protein)"); dev.off()
dev("ch01-line.png"); plot(AirPassengers, col = "steelblue", lwd = 2, main = "Line chart: AirPassengers", ylab = "Passengers (1000s)"); dev.off()

# ---- 兩個類別變數 ----
dev("ch01-groupbar.png"); barplot(table(smoke, race), col = c("#e48ca0", "#3dbcb4"), legend.text = TRUE, args.legend = list(title = "smoke", x = "topright"), main = "Bar by group: race by smoke (birthwt)", xlab = "race", ylab = "Frequency"); dev.off()
dev("ch01-mosaic.png"); mosaicplot(table(smoke, low), color = c("grey80", "orange"), main = "Mosaic plot: smoke vs low (birthwt)", xlab = "smoke", ylab = "low"); dev.off()

# ---- 一個數值變數 × 一個類別變數 ----
dev("ch01-strip.png"); stripchart(VitC ~ Cult, data = cabbages, vertical = TRUE, method = "jitter", pch = 1, col = "steelblue", main = "Strip chart: VitC by Cult (cabbages)", xlab = "Cult", ylab = "VitC"); dev.off()
dev("ch01-groupbox.png"); boxplot(VitC ~ Cult, data = cabbages, col = c("steelblue", "orange"), main = "Boxplot by group: VitC by Cult (cabbages)", xlab = "Cult", ylab = "VitC"); dev.off()
weight.status <- cut(Pima.tr$bmi, c(0, 18.5, 25, 30, Inf), right = FALSE, labels = c("Underweight", "Normal", "Overweight", "Obese"))
m <- tapply(Pima.tr$bp, weight.status, mean)
dev("ch01-means.png"); plot(m, type = "b", pch = 19, xaxt = "n", col = "steelblue", lwd = 2, main = "Plot of means: bp by weight.status (Pima.tr)", xlab = "Weight Status", ylab = "Mean blood pressure"); axis(1, at = 1:4, labels = names(m)); dev.off()
