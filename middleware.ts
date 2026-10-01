import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  const isLoginPage = request.nextUrl.pathname === "/login";
  const isRoot = request.nextUrl.pathname === "/";

  
  if (isRoot && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

 
  if (isLoginPage && token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login"],
};