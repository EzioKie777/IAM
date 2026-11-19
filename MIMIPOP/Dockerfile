FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Mimipop.csproj ./
RUN dotnet restore
COPY . ./
RUN dotnet publish Mimipop.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_ENVIRONMENT=Production
USER $APP_UID
ENTRYPOINT ["dotnet", "Mimipop.dll"]
