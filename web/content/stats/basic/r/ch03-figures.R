# 第 3 章的 R 圖檔產生程式(PMF、PDF、CDF、Jensen 不等式、中位數與分位數；深色、淺色各一張，樣式見 theme.R)
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch03-figures.R web/content/stats/basic/img
.dir <- dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)))
source(file.path(.dir, "theme.R"))
W <- 1040; H <- 460

# ---- 離散型：擲兩枚錢幣的正面數 X，PMF 與 CDF ----
x <- 0:2; p <- c(1, 2, 1) / 4; Fx <- cumsum(p)
lt_fig("ch03-discrete", W, H, function(T) {
  par(mfrow = c(1, 2))
  lt_frame(T, c(-0.5, 2.5), c(0, 0.6), main = "PMF  f(x) = P(X = x)", xlab = "x (number of heads)", ylab = "f(x)", xaxt = "n", vertical = FALSE)
  axis(1, at = 0:2, lwd = 0)
  segments(x, 0, x, p, lwd = 7, col = T$blue, lend = 1); points(x, p, pch = 19, col = T$blue, cex = 1.3)
  text(x, p + 0.05, c("1/4", "1/2", "1/4"), col = T$fg)
  lt_frame(T, c(-1, 3), c(0, 1.08), main = "CDF  F(x) = P(X <= x)", xlab = "x", ylab = "F(x)", xaxt = "n", vertical = FALSE)
  axis(1, at = -1:3, lwd = 0)
  segments(c(-1, x), c(0, Fx), c(x, 3), c(0, Fx), lwd = 2.5, col = T$blue)
  points(x, Fx, pch = 19, col = T$blue, cex = 1.2)                          # 實心點：右連續
  points(x, c(0, Fx[-3]), pch = 21, bg = T$hole, col = T$blue, cex = 1.2)   # 空心點
  text(x + 0.12, Fx + 0.06, c("1/4", "3/4", "1"), adj = 0, col = T$fg)
})

# ---- 連續型：等公車時間 X ~ Exp(平均 10 分鐘)，PDF 與 CDF ----
lam <- 1 / 10; xs <- seq(0, 40, length.out = 400); a <- 5; b <- 15
lt_fig("ch03-continuous", W, H, function(T) {
  par(mfrow = c(1, 2))
  lt_frame(T, c(0, 40), c(0, 0.1), main = "PDF  f(x)", xlab = "x (minutes)", ylab = "f(x)")
  sx <- seq(a, b, length.out = 100)
  polygon(c(a, sx, b), c(0, dexp(sx, lam), 0), col = lt_alpha(T$amber, 0.5), border = NA)
  lines(xs, dexp(xs, lam), lwd = 2.5, col = T$blue)
  text(27, 0.05, sprintf("P(5 <= X <= 15)\n= shaded area = %.3f", pexp(b, lam) - pexp(a, lam)), cex = 0.9, col = T$fg)
  lt_frame(T, c(0, 40), c(0, 1), main = "CDF  F(x) = P(X <= x)", xlab = "x (minutes)", ylab = "F(x)")
  lines(xs, pexp(xs, lam), lwd = 2.5, col = T$blue)
  segments(c(a, b), 0, c(a, b), pexp(c(a, b), lam), lty = 2, col = T$mute)
  segments(0, pexp(c(a, b), lam), c(a, b), pexp(c(a, b), lam), lty = 2, col = T$mute)
  arrows(2, pexp(a, lam), 2, pexp(b, lam), code = 3, length = 0.08, col = T$amber, lwd = 2)
  text(20, 0.35, sprintf("F(15) - F(5)\n= %.3f", pexp(b, lam) - pexp(a, lam)), adj = 0, cex = 0.9, col = T$fg)
  points(c(a, b), pexp(c(a, b), lam), pch = 19, col = T$amber)
})

# ---- Jensen 不等式：凸函數 g(x) = x^2，X 等機率取 x1、x2 ----
g <- function(t) t^2; x1 <- 0.5; x2 <- 3.5; m <- (x1 + x2) / 2
lt_fig("ch03-jensen", 820, 540, function(T) {
  lt_frame(T, c(0, 4), c(0, 16), main = "Jensen: convex g  =>  g(E[X]) <= E[g(X)]", xlab = "x", ylab = "g(x)")
  curve(g, 0, 4, lwd = 2.5, col = T$blue, add = TRUE)
  segments(x1, g(x1), x2, g(x2), lwd = 2, col = T$amber, lty = 2)
  points(c(x1, x2), g(c(x1, x2)), pch = 19, col = T$blue, cex = 1.2)
  points(m, g(m), pch = 19, col = T$fg, cex = 1.4); points(m, (g(x1) + g(x2)) / 2, pch = 19, col = T$amber, cex = 1.4)
  segments(m, 0, m, (g(x1) + g(x2)) / 2, lty = 3, col = T$mute)
  text(m + 0.08, g(m) - 0.4, "g(E[X])", adj = 0, col = T$fg); text(m - 0.08, (g(x1) + g(x2)) / 2 + 0.5, "E[g(X)]", adj = 1, col = T$amber)
  text(c(x1, m, x2), 0.9, c("x1", "E[X]", "x2"), col = T$mute, pos = 4)
})

# ---- 中位數、眾數、分位數：等公車時間 X ~ Exp(平均 10 分鐘) ----
q <- function(p) -10 * log(1 - p)
lt_fig("ch03-quantile", W, H, function(T) {
  par(mfrow = c(1, 2))
  lt_frame(T, c(0, 40), c(0, 0.1), main = "Mode < Median < Mean", xlab = "x (minutes)", ylab = "f(x)")
  lines(xs, dexp(xs, lam), lwd = 2.5, col = T$blue)
  abline(v = c(0, q(0.5), 10), col = c(T$fg, T$amber, T$red), lty = c(1, 2, 2), lwd = 2)
  text(18, c(0.09, 0.077, 0.064), c("mode = 0 (solid)", sprintf("median = %.2f (dashed)", q(0.5)), "mean = 10 (dashed)"), adj = 0, cex = 0.9,
       col = c(T$fg, T$amber, T$red))
  lt_frame(T, c(0, 40), c(0, 1), main = "Quantile: x_p = F^(-1)(p)", xlab = "x (minutes)", ylab = "F(x)")
  lines(xs, pexp(xs, lam), lwd = 2.5, col = T$blue)
  for (p in c(0.25, 0.5, 0.75)) {
    segments(0, p, q(p), p, lty = 2, col = T$amber); arrows(q(p), p, q(p), 0, length = 0.07, col = T$amber)
    text(q(p) + 0.5, 0.04 + (p == 0.5) * 0.06, sprintf("%.2f", q(p)), adj = 0, cex = 0.85, col = T$fg)
  }
  text(30, c(0.25, 0.5, 0.75) + 0.035, c("p = 0.25 (Q1)", "p = 0.5 (median)", "p = 0.75 (Q3)"), cex = 0.85, col = T$fg)
})
