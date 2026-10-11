# 第 3 章的 R 圖檔產生程式(PMF、PDF、CDF、Jensen 不等式)
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch03-figures.R web/content/stats/basic/img
out <- commandArgs(TRUE)[1]
dev <- function(f, w = 1000, h = 440) png(file.path(out, f), width = w, height = h, res = 120, type = "cairo")
blue <- "steelblue"; orange <- "darkorange"

# ---- 離散型：擲兩枚錢幣的正面數 X，PMF 與 CDF ----
x <- 0:2; p <- c(1, 2, 1) / 4; Fx <- cumsum(p)
dev("ch03-discrete.png")
par(mfrow = c(1, 2), mar = c(4.2, 4.2, 3, 1))
plot(x, p, type = "h", lwd = 6, col = blue, ylim = c(0, 0.6), xlim = c(-0.5, 2.5), xaxt = "n",
     main = "PMF  f(x) = P(X = x)", xlab = "x (number of heads)", ylab = "f(x)")
points(x, p, pch = 19, col = blue, cex = 1.3); axis(1, at = 0:2)
text(x, p + 0.05, c("1/4", "1/2", "1/4"))
plot(NA, xlim = c(-1, 3), ylim = c(0, 1.05), main = "CDF  F(x) = P(X <= x)", xlab = "x", ylab = "F(x)", xaxt = "n"); axis(1, at = -1:3)
segments(c(-1, x), c(0, Fx), c(x, 3), c(0, Fx), lwd = 2.5, col = blue)          # 水平線段
points(x, Fx, pch = 19, col = blue, cex = 1.2)                                     # 實心點：右連續
points(x, c(0, Fx[-3]), pch = 21, bg = "white", col = blue, cex = 1.2)             # 空心點
text(x + 0.12, Fx + 0.06, c("1/4", "3/4", "1"), adj = 0)
dev.off()

# ---- 連續型：等公車時間 X ~ Exp(平均 10 分鐘)，PDF 與 CDF ----
lam <- 1 / 10; xs <- seq(0, 40, length.out = 400); a <- 5; b <- 15
dev("ch03-continuous.png")
par(mfrow = c(1, 2), mar = c(4.2, 4.2, 3, 1))
plot(xs, dexp(xs, lam), type = "l", ylim = c(0, 0.1), lwd = 2.5, col = blue, main = "PDF  f(x)", xlab = "x (minutes)", ylab = "f(x)")
sx <- seq(a, b, length.out = 100)
polygon(c(a, sx, b), c(0, dexp(sx, lam), 0), col = adjustcolor(orange, 0.45), border = NA)
text(27, 0.05, sprintf("P(5 <= X <= 15)\n= orange area = %.3f", pexp(b, lam) - pexp(a, lam)), cex = 0.9)
plot(xs, pexp(xs, lam), type = "l", lwd = 2.5, col = blue, ylim = c(0, 1), main = "CDF  F(x) = P(X <= x)", xlab = "x (minutes)", ylab = "F(x)")
segments(c(a, b), 0, c(a, b), pexp(c(a, b), lam), lty = 2, col = "grey40")
segments(0, pexp(c(a, b), lam), c(a, b), pexp(c(a, b), lam), lty = 2, col = "grey40")
arrows(2, pexp(a, lam), 2, pexp(b, lam), code = 3, length = 0.08, col = orange, lwd = 2)
text(20, 0.35, sprintf("F(15) - F(5)\n= %.3f", pexp(b, lam) - pexp(a, lam)), adj = 0, cex = 0.9, col = "black")
points(c(a, b), pexp(c(a, b), lam), pch = 19, col = orange)
dev.off()

# ---- Jensen 不等式：凸函數 g(x) = x^2，X 等機率取 x1、x2 ----
g <- function(t) t^2; x1 <- 0.5; x2 <- 3.5; m <- (x1 + x2) / 2
dev("ch03-jensen.png", 760, 520)
par(mar = c(4.2, 4.2, 3, 1))
curve(g, 0, 4, lwd = 2.5, col = blue, main = "Jensen: convex g  =>  g(E[X]) <= E[g(X)]", xlab = "x", ylab = "g(x)")
segments(x1, g(x1), x2, g(x2), lwd = 2, col = orange, lty = 2)
points(c(x1, x2), g(c(x1, x2)), pch = 19, col = blue, cex = 1.2)
points(m, g(m), pch = 19, cex = 1.4); points(m, (g(x1) + g(x2)) / 2, pch = 19, col = orange, cex = 1.4)
segments(m, 0, m, (g(x1) + g(x2)) / 2, lty = 3, col = "grey40")
text(m + 0.08, g(m) - 0.4, "g(E[X])", adj = 0); text(m - 0.08, (g(x1) + g(x2)) / 2 + 0.5, "E[g(X)]", adj = 1, col = orange)
text(c(x1, m, x2), 0.9, c("x1", "E[X]", "x2"), col = "grey30", pos = c(4, 4, 4))
dev.off()
